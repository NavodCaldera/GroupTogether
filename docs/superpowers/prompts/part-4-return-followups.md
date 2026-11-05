You are making owner-approved follow-ups to **Part 4 (returns)**, commit `883b807`, in the
GroupBasket repo at the current directory, branch `main`. Claude Code reviews your work
afterwards. **This replaces any earlier version of this prompt.** If you already started from the
earlier version (the "buyer has 1 day to ask an admin" rule), do not push it. Build this instead.

## Read first

`AGENTS.md`, `CLAUDE.md`, `src/server/returns.ts`, `src/lib/return-rules.ts`,
`tests/integration/returns.int.test.ts`, and `DEC-013` in `docs/decisions.md`. Also read the
returns pages under `src/app/seller/returns`, `src/app/admin/factory/returns` and the buyer cart
page, the cart chat in `src/server/carts/chat.ts` (limits and unread pattern), and
`src/server/notify`.

## Owner decisions (2026-11-06)

1. **Every factory "no" goes to an admin automatically.** The buyer no longer has to ask. This
   applies both when the factory rejects the request, and when a buyer-fault item arrives used or
   without tags (the factory records the receipt with `unusedWithTags = false` and a condition
   note). In both cases the return moves straight to `WITH_ADMIN`, with no tokens credited.
   - Remove the buyer's "Ask an admin" action and the buyer escalation path. Keep `escalate` only
     if something internal still needs it; otherwise delete it and its tests.
   - The factory must give a **reason** when it says no (required, 1 to 1000 characters).
   - The `escalateOverdue` rule (no factory answer in 48h goes to an admin) stays as it is.
2. **The admin decides after talking with the factory, inside the app.** Add a private message
   thread on each return, between `FACTORY`/`CORE` admins and the factory's owner and `SALES`
   staff. **The buyer cannot see it.**
   - New model `ReturnMessage` (returnId, authorId, body up to 1000 characters, createdAt).
     Migration `return_messages`. Do not grant it to `gb_ai_reader`.
   - Posting is allowed only while the return is `WITH_ADMIN`. The thread stays readable to the same
     people after the decision.
   - Reuse the cart chat's rate limit (10 messages per minute per user), if it applies.
   - Each new message notifies the other side in-app after commit, with one unread notice per thread,
     following the cart chat's pattern.
   - Access is enforced in the server queries and actions. Everyone else gets 404 or a denial,
     including another factory, `PACKING` staff, a `PREMIUM` admin and the buyer.
   - Pages: the thread appears on the admin return detail and on the factory's `/seller/returns`
     item. Phone first, existing primitives, no explainer text.
3. **The admin decision is final.** Accept or reject, with a required note.
   - **Accept** when the item was already received means the return completes with one `RETURN`
     credit of `unitPrice × qty`.
   - **Accept** when the item has not arrived follows the existing accepted flow (a factory-fault
     pickup, or the buyer sends it back).
   - **Reject** means `REJECTED`, final, with nothing further.
4. **Stuck case fixed** (it follows from 1): when an admin has accepted a buyer-fault return before
   it arrives, and the factory finds it used, the factory records that. The return goes back to
   `WITH_ADMIN` for one final admin decision, with no tokens. The admin's decision on it is final.
5. **The buyer-fault "used item" rule is approved.** In `DEC-013`, change it from "Claude's call
   awaiting owner confirmation" to an approved owner rule dated 2026-11-06, worded as in decision 1
   (automatic, not buyer-requested). Add it to the spec's edge cases.

6. **No sending before approval.** The buyer keeps the item until the factory or an admin
   **accepts** the return. An item sent before acceptance is not accepted:
   - `markReceived` and pickup booking are refused unless the return is `ACCEPTED` (or
     `PICKED_UP`). Check that this is already true, and keep it.
   - The buyer's return status shows a short status label while waiting, for example "Waiting for
     approval", and a send or pickup step only after acceptance. No explainer text.
   - Record this in `DEC-013` as an approved owner rule dated 2026-11-06.

Keep the existing lock order and "the first action wins" for every decision, receipt and message
state change.

## Tests (write first, see them fail)

In `tests/integration/returns.int.test.ts`:

- Factory rejects with a reason: the status is `WITH_ADMIN`, the admins are notified, and the buyer
  has no escalate action. Rejecting without a reason is refused.
- Admin accepts a factory-fault return: the pickup flow follows. On receipt, exactly 1 credit.
- Admin rejects: the status is `REJECTED`, with 0 credits and no further action possible.
- Buyer fault, the item arrives used: the status is `WITH_ADMIN`, with 0 credits. Admin accepts:
  1 credit, `COMPLETED`. In a separate run, admin rejects: `REJECTED`, 0 credits.
- Stuck case: admin accepts a buyer-fault return, then it arrives used. The status is `WITH_ADMIN`
  with 0 credits, and the admin's final decision behaves as above.
- Messages:
  - factory `SALES` staff and a `FACTORY` admin can post and read;
  - the buyer, another factory, `PACKING` staff and a `PREMIUM` admin are refused, for both reading
    and posting;
  - posting after the decision is refused, but reading still works;
  - an empty body or one over 1000 characters is refused;
  - the 11th message within a minute is refused.
- Concurrency (`Promise.allSettled`): two admin decisions, and an admin decision racing a factory
  receipt. Exactly one outcome each, and at most one credit.
- No sending before approval: `markReceived` and `bookReturnPickup` are refused while the return
  is `WAITING_FACTORY` or `WITH_ADMIN` (before a decision), by both factory staff and admins.
- All remaining existing return tests still pass. Update or remove only those that tested the
  removed buyer escalation.
- e2e `tests/e2e/returns.spec.ts`: the buyer files, the factory rejects with a reason, the admin and
  the factory exchange a message, the admin accepts, the pickup is received, and the buyer sees the
  tokens. Include a 360px check of the message thread.

## Constraints

- No new dependencies. Touch only returns code, its pages, tests and docs.
- Update `docs/CHANGES.md` (dated 2026-11-06), `docs/decisions.md`, the spec, the operating brief
  (if it describes returns), `docs/architecture.md` (the return lifecycle and messages),
  `.claude/agents/delivery.md` and `.claude/agents/notifications.md`. Commit this prompt file too.
- Stage by path, never `git add -A`. One commit, with your `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build` and `npx prisma migrate status`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e` (the full suite). All must
  pass. Then run `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets, no
  branch resets.

## Report

- Commit hash and the push result.
- Each command's summary.
- The new status moves.
- What happened to `escalate`.
- Any deviation and why.
