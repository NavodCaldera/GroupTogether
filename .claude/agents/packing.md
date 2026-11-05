---
name: packing
description: "Factory stock receipt, two-person clothing gathering/packing and driver handover for GroupBasket. Use for packing services, rules and pages."
---

# Packing

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Status

**Parked since 2026-11-03** (`DEC-010`): factories pack their own orders (`src/server/factory-orders.ts`, `src/app/seller/(workspace)/orders/`). Keep this code and the PACKER role working behind `factoryFulfilment()` in `src/lib/fulfilment.ts`; `FULFILMENT_MODE=WAREHOUSE` brings the store flow back. Do not delete packer accounts, pages or data.

## Ownership and code

- `src/server/receiving.ts`: accepted factory stock receipt.
- `src/server/packing.ts`, `packing-actions.ts`, `src/lib/packing-rules.ts`: fulfilment steps.
- `src/app/packing/`, `src/components/packing-bits.tsx`: staff workspace.
- Policy references: `SUP-002`, `FUL-002`/`FUL-003`, `DATA-001`.

## Implementation guards

- Only accepted factory stock enters receiving. Record receiver/time once and notify supplier/admins. Receipt is separate from product linking and adding variant stock.
- Premium gifts never enter factory receiving, GroupBasket warehousing or packing.
- Packing staff see operational items/labels, not prices or payment totals.
- Paid clothing orders require one staff member to check/gather and a different person to recheck/pack. Preserve actor identities and times under cart locks.
- Sending back clears gathering/packing only before packing is finalized; never reopen a packed order through the old send-back action.
- Handover requires packing and a BOOKED/PICKED_UP delivery. Record who/when, move a booked drop to PICKED_UP and notify the owner after commit.
- Rebooking clears the previous handover, not packing certification; coordinate with [delivery](delivery.md).
- Admins inspect fulfilment through Orders/cart history/exports; admins do not perform packing operations.

## Interface boundaries

The queue starts with To receive, then To gather, To pack, For PickMe and Handed over
today. Keep staff cards brief. Item ticks are unsaved checks until packing, then fixed.
Use the existing brief packing trail and one appropriate step action. The gatherer does
not get the pack action. The label includes recipient contact/address; staff navigation
and profiles are owned jointly with [frontend](frontend.md).

## Verification and coordination

Use `src/lib/packing-rules.test.ts`, `tests/integration/receiving.int.test.ts` and
`packing.int.test.ts`. Cover receipt duplication, role/money visibility, distinct
gatherer/packer, no post-pack reset, handover prerequisites and rebooking handover.
Coordinate stock entry with [catalogue-admin](catalogue-admin.md), schema with
[backend-data](backend-data.md), notices with [notifications](notifications.md) and checks
with [qa-review](qa-review.md).

## Group design samples

Follow `SAMPLE-001` in the [operating brief](groupbasket.md) and `DEC-009` in
[decisions](../../docs/decisions.md). Pre-purchase group sample delivery is separate
from factory test-piece procurement, paid clothing orders and premium gifts. The group
pays transport; there is no sample sending fee. `src/server/samples.ts` locks requests,
checks the group owner and records transport-quote acceptance before warehouse dispatch.
Buyer `/samples` and warehouse `/admin/warehouse` share the request and tracking record.
Do not invent sample ownership, return, deposit or loss/damage policies.

## Quality cancellation (Part 3)

`cancelPaidLines` in `src/server/cancellations.ts` requires participant advisories and the cart
row, then sorted ledger users. Only ACTIVE lines in CONFIRMED/DISPATCHED carts cancel; delivered
lines are untouched. Credit the full captured line price once, decrement sold, never restock
hidden goods. Preserve stored cart.total; display projections and packing/factory lists exclude
CANCELLED lines. Call `flushCancellationNotices` after commit; durable markers/stable IDs make
retries safe. A fully cancelled dispatched cart retains Delivery and alerts WAREHOUSE admins,
without calling the provider. See `tests/integration/cancellations.int.test.ts`.

Part 3.3 guards: `src/server/quality.ts` requires FACTORY/CORE principals in mutations and queries;
flags are read-time only. Metadata commits before per-cart cleanup. OPEN/READY removal shares
`releaseLines` with setLine(0), including Done reset and stock/token/gift release. Accepted carts
stay frozen until shared confirmation cancels hidden lines; delivered lines are untouched.
Paid cancellation keeps stored totals and decrements sold without restocking hidden goods.
Fully cancelled dispatched carts retain Delivery and alert WAREHOUSE once, never the provider.
Removal reuses session-ending account locks and sends no factory-user notice. QualityNotice and
cancel-notified markers persist retries; flush only after commit. Verify `quality.int.test.ts`,
`cancellations.int.test.ts`, `ratings.int.test.ts` and the 360px `quality.spec.ts` browser journey.
