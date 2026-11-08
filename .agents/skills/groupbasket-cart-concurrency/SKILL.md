---
name: groupbasket-cart-concurrency
description: Review GroupBasket checkout, order, agent-basket, stock-hold, cancellation, pickup-code, payment-notice, token and payout mutations for lock order, transactional stock and one-open-basket invariants.
---

The name is kept for history; the group carts it was written for were removed. It now covers the
order and basket services of the area agent model.

Read `AGENTS.md`, `.claude/agents/orders-baskets.md`, `.claude/agents/payments.md`,
`.claude/agents/backend-data.md` and the relevant rules in the operating brief (`ORD-*`, `BSK-*`,
`PAY-*`, `TOK-*`). Mutations live in `src/server/orders/` (checkout, baskets, delivery, handover,
locks), `src/server/payments/notice.ts`, `src/server/tokens.ts`, `src/server/payouts/`,
`src/server/agents/` and `src/server/returns.ts`.

Trace every changed mutation through its transaction. Recheck state and deadlines after locking.
Follow the one lock order: user advisory locks (sorted) → `Order` rows (sorted) → basket advisory
`basket:<agentId>:<factoryId>` → `Basket` rows → ledger `User` rows (sorted); variant rows after any
basket advisory, in `variantId` order; the `pickup:<agentId>` advisory first for code lookups. Use
`withOrderTransaction` from `src/server/orders/locks.ts`. Never call a payment gateway inside a
transaction. A transaction alone does not prevent overselling: reserve with guarded
available-to-reserved updates.

Check the invariants: at most one `OPEN` basket per agent and factory; a paid order joins whole and
locks the basket once at the lock amount; a payment confirms once even under repeated or
simultaneous notices, with late or mismatched payments becoming tokens; cancel only before lock;
expiry releases stock and token holds; cancelled orders keep `basketId`, so queries filter by
status; ledger entries are append-only and balances never go below zero. Notices follow commit.

Use the existing race cases in `tests/integration/checkout.int.test.ts`, `baskets.int.test.ts`,
`payments.int.test.ts`, `handover.int.test.ts`, `tokens.int.test.ts`, `token-transfer.int.test.ts`,
`payouts.int.test.ts` and `delivery.int.test.ts`. Add a focused race regression when a changed path
is not covered. Run `npm run test:int -- <affected files>` against the guarded disposable test
database. Never test writes through the read-only development inspector. Report lock order,
invariant evidence and actual results; static inspection does not prove concurrency safety.
