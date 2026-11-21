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

Policy references: `ORD-001`–`ORD-005`, `RETURN-001`, `BSK-001`–`BSK-003`, `BSK-008` (own baskets), `PAY-004`,
`TOK-001`, `LOC-001`, `RATE-001`. The group-cart model (`CART-*`, `INV-001`) is retired.

Built 2026-11-15: buyer-fault returns are a record with no tokens, resold privately by the agent
(`DEC-017`), and the courier charge and agent fee are one 5% agent fee (`DEC-018`), paid in cash
at pickup (`DEC-019`): new lines store `agentFeeEach` 0 and `cashFeeEach`; `handOver` requires the
exact fee (`FEE_NOT_TAKEN`) and stores `cashFeePaid`. There is no pickup deadline; a late pickup
gets no action and no extra return time.

## Ownership and code

- Pure rules: `src/lib/agent-money.ts` (totals, PayHere fee, checkout split, cancel, return and
  missing refunds, factory earning), `src/lib/order-rules.ts` (order and basket moves),
  `src/lib/agent-rules.ts` (nearest agents, clash, opening hours, week ending, pickup-code format).
- Cart and checkout: `src/server/orders/cart.ts`, `checkout.ts` (`loadCart`, `quoteCheckout`,
  `startCheckout`, shared `assertBuyer`); pages `src/app/cart/`, `src/app/checkout/`.
- Own baskets (`DEC-023`, `DEC-027`): one factory each (`loadFactoryLines` checks every line is a live product of the basket's `factoryId`; new baskets have `productId` null, older ones keep it). Started, added to or joined from the Cart with the ticked items (`ownFromCartAction`, lines from `cartLines`, removed with `removeFromCart` once ordered); lists `myOpenOwnBaskets(buyerId, factoryId)` and `openOwnBaskets(factoryId, viewerId)` (with the viewer's state: ask, asked, declined, pay). Joining is by `OwnJoinRequest` (`askToJoin`, `answerJoinRequest`, `joinRequests`; DEC-028): paying in needs ownership, a paid order there or an accepted request (`joinable`/`isMember`). No share codes or visibility for new baskets. Agent checkout takes `variantIds` (the ticked items; undefined = whole cart) and deletes only those cart rows. `src/server/orders/own-baskets.ts` (`startOwnCheckout`, `closeOwnBasket` (needs `ownMinItems`; OPEN -> LOCKED, no fee), `confirmOwnDelivery`, `sweepOwnBaskets`). `Basket.kind` is `AGENT` or `OWN` (a CHECK constraint keeps the shape); own baskets and their orders have `agentId` null, and an own order carries `targetBasketId` until paid. Own baskets lock under the advisory `ownbasket:<basketId>` (`lockOwnBasket`, or `lockBasketOf` for either kind), taken where the agent slot would be. Statuses add `DELIVERED` and `CANCELLED` (`AWAITING_FEE` and the `DELIVERY_FEE` purpose remain in the schema but are no longer used). Code that reads `order.agent` or `basket.agent` must handle null.
- Baskets: `src/server/orders/baskets.ts` (`markOrdersPaid`, `lockBasket`,
  `expireOrders`, `releasePendingOrders`).
- Pickup and handover: `src/server/orders/handover.ts` (`lookupCode`, `handOver`).
- Buyer reads: `src/server/orders/buyer.ts`; pages `/`, `src/app/orders/`, `src/app/tokens/`.
- Returns: `src/server/returns.ts` (`fileReturn`, `factoryDecide`, `adminDecide`,
  `buyerFaultDecide`, `changeToBuyerFault`, `collectReturn`, `markResold`, `markTakenBack`,
  `lapseReturns`, `markReceived`, `escalateOverdue`, `buyerFaultHistory`).
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
- There is no buyer cancel (`DEC-026`, 2026-11-21): `cancelOrder` and its action were removed.
  Orders are cancelled only by the system (expired holds, own-basket wait rule after
  `ownMaxWaitDays` = 10, refunded in full as `ORDER_CANCEL` tokens). Cancelled orders keep
  `basketId`: every query must filter by order status.
- Stages for buyers come from `orderStage()` (`src/lib/order-stage.ts`): Filling, Packing, On the
  way, Delivered, Refunded. `buyerOrders` lists paid orders only. `basketPayments()` gives each
  own-basket buyer's lines and money (others' money only to the owner).
- Pickup codes are one per buyer per agent. `lookupCode` records every attempt; five failures in
  ten minutes block the agent. `handOver` checks the same throttle first and records a failure
  for an unknown code or items the code does not cover, with one error (`HANDOVER_REFUSED`) for
  both; it then re-resolves the code under the Order locks and sets `collectedAt`. Never show
  anything for a wrong code beyond "not found".
- Returns: the window is `collectHours` from `Order.receivedAt` and requires a collected line.
  Factory fault: tokens are credited at agent collection (`collectReturn`) as
  `factoryFaultRefund` (item price, stored courier and online agent fee, and the cash fee paid at
  pickup, never the PayHere fee); the fault is recorded, the cash fee becomes an `AGENT_FEE`
  payout deduction (`returnfee:<id>`), and for older online-fee lines the fee is taken back from
  the agent if that week's fee was already paid (`takeBackFee`). Buyer fault: `BUYER_REQUESTED` → Agents and orders
  admin → `AWAITING_HANDOVER` (`buyerHandoverDays`) → `WITH_AGENT` → `SOLD` or `TAKEN_BACK`; no
  tokens, no `returnedQty`, never holds the payout. `lapseReturns` closes unhanded accepted
  returns after the handover days. Whether the agent checks condition first is open (`DEC-016`).
- Money is `Decimal(14,2)` with `D`/`toD`/`roundMoney`; never JavaScript `number`.

## Verification and coordination

Unit: `agent-money.test.ts`, `agent-money.property.test.ts`, `order-rules.test.ts`,
`agent-rules.test.ts`, `return-rules.test.ts`. Integration: `checkout.int.test.ts`,
`baskets.int.test.ts`, `handover.int.test.ts`, `returns.int.test.ts`, `ratings.int.test.ts`,
`tokens.int.test.ts`. Browser: `tests/e2e/buyer.spec.ts` at 360 px. Apply the
`groupbasket-cart-concurrency` and `groupbasket-money-review` skills to order and basket services.
Pass explicit `now` values for time-based checks. Coordinate UI with [frontend](frontend.md);
see [qa-review](qa-review.md) for command selection.
