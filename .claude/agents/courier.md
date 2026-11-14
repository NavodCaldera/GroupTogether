---
name: courier
description: "Factory packing of locked baskets, missing items, manual courier booking by admin, Given to driver, Parcel is back and receipt at the agent for GroupBasket. There is no courier provider integration."
---

# Courier booking

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `BSK-004`–`BSK-007`, `PAY-007`, `DATA-001`. The old cart delivery, PickMe
provider and webhook, warehouse and two-person packing (`FUL-001`–`FUL-003`) are retired.

Since 2026-11-15 the agent pays every courier from its 5% agent fee and is not repaid the booked
fee; the factory pays the driver on arrival for factory-fault returns (`DEC-018`).

## Ownership and code

- Service: `src/server/orders/delivery.ts` — `markPacked`, `bookCourier`, `givenToDriver`,
  `reportMissing`, `removeMissingLine`, `dismissMissingReport`, `pendingMissingReports`,
  `markBasketReceived`.
- Factory screens: `src/app/seller/(workspace)/orders/` (To pack, Courier booked, basket tickets);
  agent receipt on `/agent`; admin Courier to book on `/admin/agents`; Factory admin Missing items
  on `/admin/factory/missing`.
- Data: `CourierBooking` (one per basket: fee, driver name, phone, vehicle, booked by,
  given-to-driver, received and failed times).
- Basket creation and locking belong to [orders-baskets](orders-baskets.md); token and payout
  effects to [payments](payments.md).

## Implementation guards

- Basket moves: `LOCKED → PACKED` (factory Owner or Packing), `PACKED → WITH_COURIER` (admin
  booking, then Given to driver), `WITH_COURIER → AT_AGENT` (agent Mark received). Use
  `canMoveBasket` and recheck status under the basket lock.
- `bookCourier` accepts only `PACKED` baskets and needs the Agents and orders admin area. The
  admin books the real trip by hand; nothing calls a courier API.
- After a failed trip Packing should record Parcel is back and the admin rebook (spec edge case,
  `BSK-005`). This is **not built**: `CourierBooking.failedAt` exists but no action sets it.
- `markBasketReceived` posts no tokens (`COURIER_REPAY` is kept only for old entries), marks orders
  `RECEIVED`, sends each buyer their pickup-code notice after commit and moves returns waiting at
  the agent onto that courier.
- A line with a pending missing report blocks Packed and is held from payouts until a Factory
  admin removes it (buyer refunded as `MISSING_ITEM` tokens, deduction on the next payout) or
  dismisses the report.
- Packing staff never see money. Factories see agent name and area, never buyer names or phones.

## Verification and coordination

Integration: `delivery.int.test.ts`, `factory-fulfilment.int.test.ts`,
`factory-screens.int.test.ts`, `payouts.int.test.ts`. Browser: `tests/e2e/factory.spec.ts`,
`agent.spec.ts` and `admin-workspaces.spec.ts` at 360 px. Coordinate notices with
[notifications](notifications.md) and checks with [qa-review](qa-review.md).
