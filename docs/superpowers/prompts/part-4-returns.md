You are doing two things in the GroupBasket repo at the current directory, branch `main`:
**(A)** a small fix to the member-done rule (`CART-006`), then **(B) Part 4 (returns)**, the last
part of the factory partnership. Claude Code reviews your work afterwards using the money,
cart-concurrency, access and browser review skills. Part B gives buyers tokens for returned items.

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`, and `.claude/agents/groupbasket.md` (`PAY-003`, `CART-006`).
2. `docs/superpowers/plans/2026-11-05-factory-partnership.md`: **Part 4 only** (Task 4.1), plus
   Global Constraints and Review Focus item 5. Its signatures and test values are binding.
3. `docs/superpowers/specs/2026-11-05-factory-partnership-design.md` (Part 4), and in
   `specs/001-factory-partnership/spec.md`: User Story 7, FR-028 to FR-033 and the edge cases
   (a factory removed while a return is open; two admins acting at once; the factory not
   answering). Also `DEC-013` in `docs/decisions.md`.
4. `.agents/skills/groupbasket-money-review`, `groupbasket-cart-concurrency` and
   `groupbasket-access-review` (`SKILL.md` in each).
5. Code to reuse, not copy:
   - `src/server/tokens.ts` (`credit`);
   - `src/server/carts/locks.ts`;
   - `src/server/cancellations.ts` (the notify-after-commit and retry pattern);
   - `src/server/ratings.ts` and `src/app/api/report-photos/[id]/route.ts` (private photo pattern);
   - `src/server/storage`;
   - `src/server/delivery/index.ts` and `provider.ts` (manual mode: an admin books PickMe by hand
     and types in the details);
   - `src/server/quality.ts` (`assertQualityAdmin`, removed factories);
   - `src/lib/factory-roles.ts`;
   - `sweep()` in `src/server/carts/service.ts`;
   - `src/server/notify`.
6. `node_modules/next/dist/docs/` before pages, actions or route handlers.

## (A) Fix: "Everyone is done" must also fire on removal, leave and emptying

Today `markDone` alone sends the owner "Everyone is done". It must be sent whenever the cart moves
from "not everyone done" to "everyone done". That includes when the last waiting member is
**removed** (`removeMember`), **leaves** (`leaveCart`), or **removes all their items** (`setLine`
to zero lines). It must be sent:

- only on that transition;
- only while the cart is `OPEN`/`READY`;
- never when no member other than the owner has items left (nothing to wait for);
- once per transition (undo, then done again, sends again, as today).

Compute "before" and "after" inside the same locked transaction. Notify after commit. Put the
transition check in one shared helper; do not copy it into each function.

Tests in `tests/integration/carts.int.test.ts`:

1. Two members, one done. The owner removes the other: the owner gets one "Everyone is done".
2. Same, but the not-done member leaves: one notice.
3. Same, but the not-done member sets their only line to 0: one notice.
4. The owner removes the only other member (no member items left): no notice.
5. Existing done tests still pass.

Commit (A) on its own.

## (B) Part 4: returns

### Fixed rules (do not change)

- A buyer may file a return for **their own** line in a `DELIVERED` cart, only within **48 hours
  of delivery, inclusive** (`withinWindow`). There is one open return per line at a time. `qty` is
  between 1 and (line qty − qty already returned or in an open return).
- The buyer gives a reason (the existing `ReportReason`), a fault side (`FACTORY` or `BUYER`) and a
  note. **Factory fault needs at least one photo** (FR-029). Up to 5 photos, images only. They are
  private, using the report-photo pattern: visible to the buyer, the factory owner and its `SALES`
  staff for this return, and `FACTORY`/`CORE` admins. Everyone else gets 404.
- The buyer keeps the item until there is a decision.
- **The factory decides first**: its owner or `SALES` staff, within 48 hours of filing. After
  48 hours, `sweep` moves the return to `WITH_ADMIN` (`escalateOverdue(now)`), and a late
  `factoryDecide` is refused. Once `WITH_ADMIN`, only an admin decides.
- If the factory rejects, the buyer may escalate to an admin. **The admin's decision is final.**
  Admins are `FACTORY` and `CORE` only.
- If the factory is **removed** (profile `REMOVED`) while a return is open, the return goes to
  `WITH_ADMIN` right away, and the factory's staff can no longer see or act on it.
- **Factory fault accepted:** a PickMe pickup is needed at the factory's cost. Delivery runs in
  manual mode, so record the return pickup on the return (provider ref, booked by, `paidBy =
FACTORY`) and notify `WAREHOUSE` admins in-app to book it. Add an admin action to enter the
  booking details. Do not call any provider automatically. Do not create a second `Delivery` for
  the cart.
- **Buyer fault accepted:** the buyer arranges and pays for delivery. The factory confirms on
  receipt whether the item is **unused with tags**.
- **Tokens** (FR-032): when an accepted return is marked **received** (factory fault), or received
  and confirmed unused with tags (buyer fault), `credit(…, unitPrice × returnQty, "RETURN",
{ returnId })` goes to the buyer, once. The line's returned quantity increases, and when it
  reaches the line qty the line becomes `RETURNED` and `notEarned`. **No cash or bank refund
  anywhere (`PAY-003`).**
- **Two people acting on the same return at once:** only the first action counts. The other gets
  "This return has already been decided". Lock the return row.
- **Delivery time:** add `Delivery.deliveredAt`, set wherever a delivery or cart is marked
  `DELIVERED` (both paths in `src/server/delivery/index.ts`). Migration data step: for existing
  delivered deliveries, use the delivery's last update time (Claude's call). Carts without a
  delivery time cannot file returns.

### Claude's call (follow it, and mention it in the report)

If a **buyer-fault** item arrives and the factory says it is **not** unused with tags, the return
becomes `REJECTED` at receipt with the factory's note. The buyer may escalate once to an admin,
whose decision is final, exactly like a normal rejection. If the admin accepts, tokens are
credited as above.

### Statuses

Use the design's `WAITING_FACTORY`, `WITH_ADMIN`, `ACCEPTED`, `REJECTED`, `PICKED_UP`,
`RECEIVED`, `COMPLETED`, or explain any change. Every move is allowed only from a valid earlier
status. Write the allowed moves as one pure function in `src/lib/return-rules.ts`, with unit tests.

### Pages (phone first, existing primitives, no explainer text)

- **Buyer:** a "Return" action on their own lines in a delivered cart, while inside the window.
  A status view, with "Ask an admin" after a rejection.
- **Factory:** `/seller/returns` (owner and `SALES`): decide, and mark received (buyer fault:
  unused with tags yes or no).
- **Admin:** `/admin/factory/returns`: the escalated list, decide with a note, enter the pickup
  booking.
- Each step notifies the other side in-app, after commit.

### Tests (write first, see them fail, then implement)

Every test listed in the plan for Task 4.1, with its exact values. Plus:

1. Window: delivered at 10:00 on day 1. Filing at 10:00 on day 3 is allowed; filing at 10:01 is
   refused. A cart with no `deliveredAt` is refused.
2. Ownership: another member of the same cart, a stranger and the factory cannot file on the
   buyer's line. Factory staff with roles other than `OWNER`/`SALES` cannot decide.
3. Quantity: a line with qty 3 takes a return of 2. Then a return of 2 more is refused, and a
   return of 1 is allowed after the first finishes. Tokens credited = `unitPrice × returned qty`.
   The line is `RETURNED` only when all 3 are returned.
4. Concurrency (`Promise.allSettled`):
   - `factoryDecide` racing `escalateOverdue` gives exactly one outcome;
   - two `adminDecide` calls give exactly one outcome;
   - two `markReceived` calls give exactly one `RETURN` credit.
5. A factory removed with an open return: the return is `WITH_ADMIN` and the factory's staff are
   refused.
6. Private photos: the buyer, the factory owner, factory `SALES` staff and `FACTORY`/`CORE` admins
   can open them. Another buyer, another factory, `PACKING` staff and a `PREMIUM` admin get 404.
7. The ledger has no `RETURN` credit before the item is received, and none for a rejected return.
8. Buyer fault, not unused: rejected at receipt, then escalated, then the admin accepts, then one
   credit.
9. Browser (`tests/e2e/returns.spec.ts`, desktop plus a 360px smoke): the Lanka Shirts example.
   The buyer files a defect return, the factory rejects, the buyer escalates, the admin accepts,
   the pickup is entered and received, and the buyer's account shows the tokens.

## Docs

- Add a dated `docs/CHANGES.md` entry for (A) and for (B).
- Update `docs/implementation-status.md` (factory partnership complete; external PickMe booking for
  returns is manual), `docs/architecture.md` (the return lifecycle), and
  `.claude/agents/delivery.md`, `.claude/agents/catalogue-admin.md`, `.claude/agents/carts.md` and
  `.claude/agents/notifications.md`.
- Record the buyer-fault "not unused" handling under `DEC-013` as Claude's call awaiting owner
  confirmation, not as approved policy.
- Commit this prompt file too.

## Constraints

- No new dependencies.
- No factory payouts, which are a non-goal. Record `notEarned` only.
- Do not touch Sentry, login lockout, security headers or activation code.
- Stage by path, never `git add -A`. Two commits: (A), then (B). Each ends with your
  `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build` and `npx prisma migrate status`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e` (the full suite). All must
  pass. Then run `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets, no
  branch resets.

## Report

- Commit hashes and the push result.
- Each command's summary.
- The status moves you implemented.
- How return pickups are recorded.
- The lock structure for decisions and receipt.
- Any deviation from the plan and why, and anything you were unsure about.
