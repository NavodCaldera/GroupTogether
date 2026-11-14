---
name: orders-baskets
description: "Personal cart, checkout, orders, agent baskets, stock holds, cancellation, pickup codes, handover and returns through agents for GroupBasket. Use for order and basket rules, services, queries and actions."
---

# Orders and baskets

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `ORD-001`–`ORD-005`, `RETURN-001`, `BSK-001`–`BSK-003`, `PAY-004`,
`TOK-001`, `LOC-001`, `RATE-001`. The group-cart model (`CART-*`, `INV-001`) is retired.

Decided but not built (2026-11-14): buyer-fault returns become a record with no tokens, resold
privately by the agent (`DEC-017`), and the courier charge and agent fee become one 5% agent fee
(`DEC-018`). The code below still follows the old rules.

## Ownership and code

- Pure rules: `src/lib/agent-money.ts` (totals, PayHere fee, checkout split, cancel, return and
  missing refunds, factory earning), `src/lib/order-rules.ts` (order and basket moves),
  `src/lib/agent-rules.ts` (nearest agents, clash, opening hours, week ending, pickup-code format).
- Cart and checkout: `src/server/orders/cart.ts`, `checkout.ts` (`loadCart`, `quoteCheckout`,
  `startCheckout`, shared `assertBuyer`); pages `src/app/cart/`, `src/app/checkout/`.
- Baskets: `src/server/orders/baskets.ts` (`markOrdersPaid`, `lockBasket`, `cancelOrder`,
  `expireOrders`, `releasePendingOrders`).
- Pickup and handover: `src/server/orders/handover.ts` (`lookupCode`, `handOver`).
- Buyer reads: `src/server/orders/buyer.ts`; pages `/`, `src/app/orders/`, `src/app/tokens/`.
- Returns: `src/server/returns.ts` (`fileReturn`, `factoryDecide`, `adminDecide`,
  `collectReturn`, `lapseReturns`, `markReceived`, `escalateOverdue`).
- Locks: `src/server/orders/locks.ts`. The shared error class is `AppError` in `src/server/errors.ts`
  (`CartError` is kept as an alias until every import changes).
- Courier and packing steps belong to [courier](courier.md); gateway and payouts to
  [payments](payments.md); agent lifecycle to [agents](agents.md).

## Implementation guards

- **Lock order everywhere:** user advisory locks (sorted) → `Order` rows (sorted) → basket
  advisory `basket:<agentId>:<factoryId>` → `Basket` rows → ledger `User` rows (sorted). Variant
  rows are locked after any basket advisory, in `variantId` order. Pickup lookups take the
  `pickup:<agentId>` advisory first. Use `withOrderTransaction`; never call the gateway inside a
  transaction.
- The cart reserves nothing. `startCheckout` creates one `PENDING` order per factory, reserves
  stock (never below free), holds tokens and creates one `PaymentAttempt` for the checkout. The
  gateway redirect happens after commit. A fully token-paid checkout goes straight to `PAID`.
- `markOrdersPaid` moves reserved stock to sold, spends the token hold, attaches each order to the
  open basket (creating one if needed, enforced by the one-OPEN-per-agent-and-factory partial
  unique index), adds `itemsTotal` and locks at `basketLockAmount`. An order is never split.
- `expireOrders` releases stock and tokens for `PENDING` orders past `holdUntil`.
- `cancelOrder` is allowed only while the basket is `OPEN`: full refund as `ORDER_CANCEL` tokens,
  stock released, basket total and `firstOrderAt` recomputed. Cancelled orders keep `basketId`:
  every query must filter by order status.
- Pickup codes are one per buyer per agent. `lookupCode` records every attempt; five failures in
  ten minutes block the agent. `handOver` checks the same throttle first and records a failure
  for an unknown code or items the code does not cover, with one error (`HANDOVER_REFUSED`) for
  both; it then re-resolves the code under the Order locks and sets `collectedAt`. Never show
  anything for a wrong code beyond "not found".
- Returns: the window is `collectHours` from `Order.receivedAt` and requires a collected line.
  Tokens are credited at agent collection (`collectReturn`): `qty × unitPrice` for factory fault,
  `qty × (unitPrice − courierPerItem)` for buyer fault. A factory-fault collection records the
  fault and a `RETURN_COURIER` payout deduction. `lapseReturns` closes unhanded accepted returns
  after `returnHandoverDays`. Whether the agent checks condition first is open (`DEC-016`).
- Money is `Decimal(14,2)` with `D`/`toD`/`roundMoney`; never JavaScript `number`.

## Verification and coordination

Unit: `agent-money.test.ts`, `agent-money.property.test.ts`, `order-rules.test.ts`,
`agent-rules.test.ts`, `return-rules.test.ts`. Integration: `checkout.int.test.ts`,
`baskets.int.test.ts`, `handover.int.test.ts`, `returns.int.test.ts`, `ratings.int.test.ts`,
`tokens.int.test.ts`. Browser: `tests/e2e/buyer.spec.ts` at 360 px. Apply the
`groupbasket-cart-concurrency` and `groupbasket-money-review` skills to order and basket services.
Pass explicit `now` values for time-based checks. Coordinate UI with [frontend](frontend.md);
see [qa-review](qa-review.md) for command selection.
