You are implementing **Part 3 (ratings, reports, flags, hiding a product, removing a factory)** of
the GroupBasket factory partnership feature, in the repo at the current directory, on branch
`main`. Claude Code reviews your work afterwards with the money, cart-concurrency, access and
browser review skills. This part takes items out of **paid** orders and gives buyers tokens.

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`. Money rules: `Decimal(14,2)`, `D`/`toD`, never JS `number` for money.
2. `docs/superpowers/plans/2026-11-05-factory-partnership.md`: **Part 3 only** (Tasks 3.1, 3.2,
   3.3), plus Global Constraints and Review Focus. The signatures and test values there are binding.
3. `docs/superpowers/specs/2026-11-05-factory-partnership-design.md` (Part 3) and
   `specs/001-factory-partnership/spec.md` FR-015 to FR-022, FR-023a and the edge cases.
   `DEC-013` in `docs/decisions.md`.
4. `.agents/skills/groupbasket-money-review`, `groupbasket-cart-concurrency` and
   `groupbasket-access-review` (`SKILL.md` in each).
5. Code from Parts 1–2 that you must reuse rather than copy:
   - `src/server/tokens.ts` (`credit`, `releaseLineTokens`);
   - `src/server/carts/locks.ts` (`withCartTransaction`, lock order);
   - `src/server/carts/confirmation.ts` (`confirmPaidCart`, `notifyCartConfirmed`);
   - `src/server/carts/service.ts` (`setLine`, `releaseLines`, `close`, `sweep`);
   - `src/server/agreements.ts` (`sellingFactoryWhere`);
   - `src/server/catalogue.ts` (`IN_SHOP`, keep the `[...IN_SHOP.AND, …]` merge);
   - `src/server/ratings.ts`;
   - `src/server/packing.ts` and `src/server/delivery/index.ts`;
   - `src/server/storage` (private photos, as with slips);
   - `src/server/notify`.
6. `node_modules/next/dist/docs/` before pages, actions or route handlers.

## Owner decision for this part (2026-11-05, record it under DEC-013)

**Once the cart owner clicks finish (accept), nobody can change the cart, and the owner uploads
the bank slip.** A product hidden (or a factory removed) while a cart is `AWAITING_SLIP` or
`SLIP_REVIEW` therefore stays in that cart unchanged: same total, same amount due. When that slip
is approved, its lines for hidden products are cancelled immediately through `cancelPaidLines`,
with full-price tokens and the reason. Do this inside `confirmPaidCart`'s transaction, after the
cart becomes `CONFIRMED`, so the token-covered (no slip) path behaves the same. If the slip is
rejected and the cart later expires, the normal release applies.

## Fixed rules (do not change)

- Unpaid carts (`OPEN`/`READY`): remove the hidden product's lines through the **existing**
  line-removal path (tokens released, stock released, cart status recomputed). A `READY` cart that
  falls below its minimum goes back to `OPEN`, exactly as when a member removes an item.
- Paid carts not yet delivered (`CONFIRMED`/`DISPATCHED`): `cancelPaidLines`. Each line becomes
  `CANCELLED` and `notEarned`. The line owner gets a `CANCELLATION` credit of `qty × unitPrice`
  (the full price, commission included, even if part was paid with tokens; FR-023a), plus a
  notification with the reason. When no `ACTIVE` lines remain, the cart becomes `CANCELLED`.
  `GroupCart.total` stays as stored (it is what was paid). The totals shown to users exclude
  `CANCELLED` lines.
- `DELIVERED` carts are never touched by hiding or removal.
- Everything is idempotent: hiding twice or removing twice gives one credit per line. Reuse the
  existing `credit` event key (`credit:CANCELLATION:<lineId>`).
- Removing a factory:
  - its profile becomes `REMOVED`, with `removedAt`/`removedById`/`removalReason`;
  - the factory user and all its staff are locked, and their sessions end (reuse `setUserLocked`'s
    session ending);
  - all its products are hidden as above;
  - `earningsHeld` and its note are set when chosen (FR-022);
  - **no notification to any factory user**;
  - buyers are notified with the reason.
- Hide, remove and flag pages: `FACTORY` and `CORE` admins only. Other admin areas and all
  non-admins are refused, both in actions and in page queries.
- Flags are computed when asked, never stored. Nothing hides or removes automatically (FR-019).
- Ratings:
  - once per product per order, 1 to 5 stars, only by the user who owns an `ACTIVE` or `RETURNED`
    line of that product in a `DELIVERED` cart;
  - a 1 or 2 star rating needs a report; damaged, wrong item and stitching reports need at least
    one photo;
  - photos are private: stored through `src/server/storage`, served only to `FACTORY`/`CORE`
    admins and the rater, 404 for everyone else;
  - old `FactoryRating` rows count one-for-one in the factory score (FR-017).
- Hidden products disappear from the shop, search, facets, product pages and "add to cart".

## Consequences you must handle (Claude's calls; follow them and mention them in the report)

- **Stock** for a cancelled paid line: decrement `sold` by `qty`. Do not add it back to
  `available` (the product is hidden). Write the reason in a comment.
- **Packing and delivery:** packing lists, gather counts and the factory order views must exclude
  `CANCELLED` lines. If a cart that is already `DISPATCHED` becomes fully `CANCELLED`, do not
  change its `Delivery` record. Notify `WAREHOUSE` admins in-app with the cart code, so a person
  deals with the pickup. Do not call the delivery provider.
- **Lock order:** hide and remove touch many carts. Process one cart per transaction through
  `withCartTransaction`, never all carts in one. Credits take the ledger lock in the existing
  order. A failure part-way must be safe to re-run (idempotent), so both `hideProduct` and
  `removeFactory` set `hiddenAt`/`REMOVED` first and then sweep the affected carts.
- **Notifications** go out only after each transaction commits.

## Tests (write first, see them fail, then implement)

Write every test listed in the plan for Tasks 3.1 to 3.3, with its exact values. Also:
1. Hiding a product that is in an `AWAITING_SLIP` cart: the line, total and amount due are
   unchanged. After the slip is approved, the line is `CANCELLED` with one full-price credit, and
   the cart stays `CONFIRMED` when other lines remain.
2. The same in a token-covered cart that is accepted after the hide: the cart is confirmed and the
   hidden line is cancelled with a credit in the same transaction.
3. A cart in `SLIP_REVIEW` whose slip is rejected and which then expires: tokens and stock are
   released, and no `CANCELLATION` credit is written.
4. A `READY` cart at its minimum loses the hidden line: it is `OPEN`, the member's tokens on that
   line are released, and the stock is released.
5. A line that used 500 tokens and is cancelled: the credit is the full `qty × unitPrice`, and the
   member's balance = previous balance + full price.
6. `hideProduct` and `cancelPaidLines` running concurrently with `setLine`, `applyTokens` and
   `approveSlip` on the same cart (`Promise.allSettled`): no deadlock, one credit per cancelled
   line, and the ledger invariant holds (balance + `tokensApplied` on `ACTIVE` lines of unpaid
   carts = total credited).
7. A `DISPATCHED` cart that becomes fully cancelled: `Delivery` is unchanged, and one
   `WAREHOUSE` admin notification is sent.
8. A report photo URL opened by another buyer, by the factory, or by a `PREMIUM` admin returns 404.
9. Removing a factory: its staff sessions are deleted, the next request by its staff is signed
   out, and there are 0 notifications to factory users.

## Constraints

- No new dependencies. Do not start Part 4 (returns). Do not touch Sentry, login lockout, security
  headers or activation code.
- UI: phone first (360px), existing primitives, **no explainer text**.
- Update `docs/CHANGES.md` (dated 2026-11-05, newest first), `docs/decisions.md` (the owner
  decision above, under `DEC-013`), `specs/001-factory-partnership/spec.md` (the same edge case),
  `docs/implementation-status.md`, `docs/architecture.md`, `.claude/agents/catalogue-admin.md`,
  `.claude/agents/carts.md`, `.claude/agents/packing.md` and `.claude/agents/notifications.md`.
  Commit this prompt file too.
- Stage by path, never `git add -A`. One commit per task (three commits), each with your
  `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build` and `npx prisma migrate status`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e` (the full suite). All must
  pass. Then run `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets, no
  branch resets.

## Report

- Commit hashes and messages, and the push result.
- Each command's summary.
- How the stock and dispatched-cart consequences were handled.
- The lock and transaction structure of `hideProduct`/`removeFactory`.
- Any deviation from the plan and why, and anything you were unsure about.
