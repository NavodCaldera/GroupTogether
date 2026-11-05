You are implementing **Part 2 (Commission and tokens)** of the GroupBasket factory partnership
feature, in the repo at the current directory, branch `main`. Claude Code reviews your work
afterwards with the money and cart-concurrency review skills. This part handles money: be exact.

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`. Money rules: `Decimal(14,2)`, `D`/`toD` from `src/lib/decimal.ts`,
   never JavaScript `number` for money.
2. `docs/superpowers/plans/2026-11-05-factory-partnership.md` — **Part 2 only** (Tasks 2.1, 2.2,
   2.3), plus Global Constraints and Review Focus. Signatures and test values there are binding.
3. `docs/superpowers/specs/2026-11-05-factory-partnership-design.md` (Part 2 data model and
   behaviour) and `specs/001-factory-partnership/spec.md` FR-013, FR-014, FR-023 to FR-027,
   User Story 2 and the edge cases.
4. `.agents/skills/groupbasket-money-review/SKILL.md` and
   `.agents/skills/groupbasket-cart-concurrency/SKILL.md` — your code will be reviewed against them.
5. Code: `src/server/carts/service.ts` (`lockCart`, `assertOneCart`, `setLine`, `leaveCart`,
   `cancelCart`, `sweep`, `acceptMerge`), `src/server/carts/slips.ts` (`uploadSlip`, `approveSlip`,
   `rejectSlip`), `src/lib/cart-rules.ts`, `src/lib/cart-money.property.test.ts`,
   `src/server/seller-actions.ts`, `src/server/settings.ts`, `src/app/admin/settings/page.tsx`,
   `tests/integration/carts.int.test.ts`.
6. `node_modules/next/dist/docs/` before pages, actions or route handlers.

## Fixed rules (do not change)

- Buyer price = factory price + the commission in force **when the listing was created**
  (snapshot on `Product.commission`). Default commission LKR 100 per piece. Zero allowed, negative
  refused, max 2 decimal places. Only `CORE` admins change it; changes affect new listings only.
- Commission applies only to **factory listings** (`sellerId` set and seller is not a brand).
  GroupBasket's own and lot products keep today's pricing. `Product.price` stays the buyer price so
  every existing price path is untouched.
- When a factory edits its price on an existing listing, buyer price = new factory price + that
  listing's **stored** commission. Never re-read the current setting for an existing listing.
- Migration data step: existing factory listings get `commission = 100`,
  `factoryPrice = price − 100`. **Before writing it, count factory listings with `price < 100` in
  the dev database. If any exist, stop and report the count instead of guessing.**
- Tokens: LKR 1 each, never expire, belong to one person, no cash out (`PAY-003`). Balance = sum of
  `TokenEntry.amount`; the ledger is append-only (no updates or deletes of entries).
- A member applies tokens only to **their own** line, while the cart is `OPEN`/`READY` and not
  expired, up to that line's full value (`qty × unitPrice − already applied`), never above their
  balance.
- The owner's transfer (slip amount) = cart total − sum of `tokensApplied`. The cart minimum still
  uses the **full** total.
- Tokens return at once (`RELEASE`) when the line is removed or reduced below its applied amount
  (release only the excess), the member leaves, the cart expires, or it is cancelled before payment.
  Slip approval turns holds into `SPEND`. A rejected slip leaves holds in place (the cart can still
  be paid or later expire).
- Merges move lines with their `tokensApplied` and holds intact (lines keep their id).
- Every money event writes exactly one ledger entry; unique keys stop doubles (design: unique on
  `(cartLineId, kind)` for `HOLD`/`RELEASE`/`SPEND` — if a line can be held, released and held
  again, design the key so a second hold after a release is possible but a duplicate is not, and
  explain the choice).

## Concurrency (reviewed closely)

- `applyTokens` and every release/spend run inside the cart's existing transaction and lock order.
  Take locks in one documented order everywhere: per-user advisory lock (as `assertOneCart` does) →
  cart row (`lockCart`) → user ledger row (`SELECT … FROM "User" WHERE id = … FOR UPDATE`). Do not
  invent a second ordering. Write the order in a comment next to `applyTokens`.
- Two concurrent `applyTokens` of 1500 with balance 1500, on lines in two different carts → exactly
  one succeeds (`Promise.allSettled`).
- Notify only after the transaction commits.

## What to build

Tasks 2.1, 2.2 and 2.3 exactly as in the plan: schema + migration, `src/lib/price-rules.ts`,
`src/lib/token-rules.ts`, `src/server/tokens.ts`, `amountDue` in `src/lib/cart-rules.ts`, seller
form (factory price input; buyer price shown live), CORE commission setting on
`/admin/settings`, token controls on the member's own line on the cart page, balance and ledger
history on the account page, owner pay page and slip amount using `amountDue`.

## Tests (write first, see them fail, then implement)

All tests listed in the plan for Tasks 2.1 to 2.3 with its exact values, plus:
1. Reducing qty below the applied amount releases only the excess; balance and line agree.
2. A merged line keeps its `tokensApplied`; paying the target cart spends it.
3. Slip rejected → holds stay; cart later expires → full release.
4. Applying tokens on a paid, expired or someone else's line is refused; amounts with more than
   2 decimals or ≤ 0 are refused.
5. Ledger never has two entries for the same event under `Promise.allSettled` retries of release
   and spend.
6. `uploadSlip`'s recorded amount equals `amountDue`.
7. Property test (existing style, fixed seed, integer-cent model): `amountDue` is never negative and
   never above the total; `balanceOf` matches the cent model.

## Constraints

- No new dependencies. Do not start Parts 3–4. Do not touch Sentry, login lockout, security
  headers or activation code. UI: phone first (360px), existing primitives, **no explainer text**.
- Update `docs/CHANGES.md` (dated 2026-11-05, newest first), `docs/implementation-status.md`,
  `docs/architecture.md`, `.claude/agents/payments-slips.md` and `.claude/agents/carts.md`.
  Commit this prompt file too.
- Stage by path, never `git add -A`. One commit per task (three commits) with your
  `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build`, `npx prisma migrate status`, then
  `GROUPBASKET_E2E=1 npx next build` and `CI=1 npm run e2e` (full). All must pass; then
  `git push origin main`. No force-push, amend of pushed commits, deploy, production data, secrets
  or branch resets.

## Report

Commit hashes and messages, push result, each command's summary, the `price < 100` count, the
unique-key design for holds, the lock order you used, any deviation from the plan and why, and
anything you were unsure about.
