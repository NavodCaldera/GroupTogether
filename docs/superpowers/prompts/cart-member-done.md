You are implementing a new **owner-approved cart rule: every member marks their items done before
the owner can finish**, in the GroupBasket repo at the current directory, branch `main`. Claude
Code reviews your work afterwards with the cart-concurrency, money, access and browser review
skills. This is separate from the factory partnership parts. If Part 3 is in progress, finish and
push it first, then rebase your understanding on the latest `main`.

## Read first

1. `AGENTS.md`, `CLAUDE.md`, and the operating brief `.claude/agents/groupbasket.md` (`CART-001`
   to `CART-005`, `INV-001`).
2. `.agents/skills/groupbasket-cart-concurrency/SKILL.md`.
3. `src/server/carts/service.ts` (`joinCart`, `setLine`, `leaveCart`, `releaseLines`,
   `acceptAndPay`, `requestMerge`, `acceptMerge`, `sweep`), `src/server/carts/locks.ts`
   (`withCartTransaction` and lock order), `src/server/tokens.ts` (`applyTokens`,
   `releaseLineTokens`), `src/server/carts/actions.ts`, `src/app/c/[code]/` (cart page),
   `src/server/notify`, `tests/integration/carts.int.test.ts`.
4. `node_modules/next/dist/docs/` before pages or actions.

## Owner decision (2026-11-05)

Before the cart owner can click finish (accept), **every other member with items must click
"Done"** for their own items. The owner can **remove a member who is not done**. A member can undo
done until the owner finishes. Once the owner finishes, nobody can change the cart (existing
rule).

## Rules

- New `CartMember.doneAt DateTime?`. Migration `cart_member_done`. Existing rows: `null`.
- `markDone(userId, cartId)` and `undoDone(userId, cartId)`:
  - only the member themself;
  - only while the cart is `OPEN`/`READY` and not expired;
  - the owner does not need it (finish counts as the owner's done; Claude's call).
- **Any change to a member's own share resets their done** (`doneAt = null`) in the same
  transaction: `setLine` for their lines (add, change qty, remove), `applyTokens` and token
  releases on their lines, and gift reservation changes for them. A member who joins or arrives by
  merge starts not done.
- `acceptAndPay` additionally requires: every member **other than the owner** who has at least one
  line has `doneAt` set. Members with no lines do not block (Claude's call). Otherwise refuse with
  `CartError("Waiting for every member to mark their items done")`. Check this **inside** the
  locked transaction.
- `removeMember(ownerId, cartId, memberId, now = new Date())`:
  - only the owner;
  - cart `OPEN`/`READY` and not expired;
  - the member is not the owner, and is **not done** (refuse a done member with
    `CartError("This member has marked their items done")`);
  - release their lines through the existing `releaseLines` path (stock, tokens and gift
    reservations released, lines deleted), delete their membership, and recompute cart status
    (`READY` → `OPEN` when below minimum) exactly as `leaveCart` does;
  - notify the removed member after commit: "Removed from <cart name or code>";
  - a removed member may join again later (Claude's call; no block list).
- Notify the owner once when the last required member becomes done ("Everyone is done"), only on
  the transition, never twice for the same state.
- All of these run through `withCartTransaction([cartId], [actor, member…])` and `lockCart`, in
  the existing lock order. Notifications go out after commit.

## UI (phone first, existing primitives, no explainer text)

- Member's own section on the cart page: a **Done** button, and **Undo** once done.
- Owner view: a done badge beside each member. **Remove** appears for members who are not done
  (with the existing confirm pattern). Finish is disabled until everyone required is done, and
  shows a count such as "2 of 4 done".

## Tests (write first, see them fail, then implement)

In `tests/integration/carts.int.test.ts`:

1. Owner cannot finish while a member with items is not done. After that member marks done, the
   owner can finish.
2. A member with no lines does not block finish.
3. A done member who changes qty, removes an item or applies tokens is reset to not done, and
   finish is refused again.
4. `undoDone` works before finish and is refused after finish.
5. The owner removes a not-done member: their stock and tokens are released (balance restored),
   their lines and membership are gone, a `READY` cart below the minimum becomes `OPEN`, and the
   removed member is notified.
6. The owner cannot remove a done member, cannot remove themself, and a non-owner cannot remove
   anyone.
7. Concurrency (`Promise.allSettled`): `markDone` racing `acceptAndPay` never yields a finished
   cart with a not-done member. `setLine` racing `markDone` leaves `doneAt` consistent with the
   final lines (a change after done resets it). `removeMember` racing `markDone` gives exactly one
   outcome.
8. Merge: a member who moves in by `acceptMerge` arrives not done.
9. "Everyone is done" notifies the owner once. Undo followed by done again notifies again.

Update the existing e2e journey (`tests/e2e/journey.spec.ts`) so the member marks done before the
owner finishes. Add a 360px check of the Done/Undo/Remove controls.

## Docs

- Add a new stable rule `CART-006 — Member done before finish` to the operating brief.
- Record the owner decision in `docs/decisions.md`.
- Add a dated `docs/CHANGES.md` entry.
- Update `docs/implementation-status.md`, `docs/architecture.md` (the cart lifecycle) and
  `.claude/agents/carts.md` and `.claude/agents/frontend.md`.
- Commit this prompt file too.

## Constraints

- No new dependencies. Do not change token, commission, slip or partnership rules beyond the
  done reset described above.
- Stage by path, never `git add -A`. One commit, with your `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build` and `npx prisma migrate status`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e` (the full suite). All must
  pass. Then run `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets, no
  branch resets.

## Report

- Commit hash and the push result.
- Each command's summary.
- Every place that resets done.
- How the done check and `removeMember` fit the lock order.
- Any deviation and why.
