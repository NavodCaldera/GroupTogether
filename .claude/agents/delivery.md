---
name: delivery
description: "Clothing delivery booking, outcome recording, rebooking and provider integration for GroupBasket. Premium gifts use the separate brand fulfilment workflow."
---

# Delivery

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- `src/server/delivery/provider.ts`: provider interface, manual provider and provisional PickMe adapter.
- `src/server/delivery/index.ts`: booking, status changes and owner receipt confirmation.
- `src/server/orders.ts`, `src/app/admin/orders/page.tsx`: order board.
- `src/app/api/webhooks/pickme/route.ts`; booking/status actions in `src/server/admin-actions.ts`.
- Policy references: `FUL-001`?`FUL-003`, `UX-002`. Physical handover belongs to [packing](packing.md); gifts to [brands-rewards](brands-rewards.md).

## Implementation guards

- One clothing drop goes to the owner's snapshotted address, city, phone and coordinates. The owner pays the driver; `Delivery.paidBy` stays OWNER and a quoted fee is informational.
- First booking requires CONFIRMED without a delivery. It creates the delivery and moves the cart to DISPATCHED; this records booking, not physical departure.
- Failed/cancelled drops may be rebooked for a DISPATCHED cart on the same delivery record. Replace booking details and clear handover attribution for another handover; retain packing certification.
- Handover requires packing and an eligible booking. Notify the owner and packers after the relevant transaction commits.
- Delivery completion moves the cart to DELIVERED. Owner `markReceived` requires DISPATCHED with BOOKED/PICKED_UP delivery, refuses failed drops and is idempotent on repeat. Notify other members.
- `/admin/orders` owns booking, delivered/failed actions and rebooking. Cart inspection has no delivery controls. `/admin/deliveries` and `/admin/packing` are redirects.
- The booking form accepts an optional tracking URL; a supplied value must be a full URL.

## Provider boundary

Manual booking is the default: an admin arranges the real trip externally and records it.
The PickMe adapter's request/response and callback shapes are placeholders; obtain actual
provider documentation and credentials before relying on automation. Do not treat an
unverified statement about public API availability as a permanent provider fact.

The existing adapter uses `PICKME_API_URL`, `PICKME_API_KEY`, `PICKME_MERCHANT_ID`
and a 15-second external-call timeout. The webhook verifies raw-body HMAC-SHA256 through
`x-signature` and rejects an unset/placeholder `PICKME_WEBHOOK_SECRET`. Preserve receiver-paid
behavior and send coordinates only once a real provider contract is established.

## Verification and coordination

Check affected delivery cases in `tests/integration/admin.int.test.ts`,
`packing.int.test.ts` and the buyer journey. Include rebooking, repeated completion,
owner authorization and webhook rejection when affected. Follow [qa-review](qa-review.md).
Gift courier tracking and delivery-charge decisions remain separate under `DEC-004`.

## Group design samples

Warehouse administration requires WAREHOUSE access; there is no unrestricted admin. Premium/factory admins cannot review slips or book customer deliveries. Warehouse admins also own cart/payment/bank settings, the orders CSV export on Orders, and buyer and packing-staff accounts (`ADMIN-002`).

Follow `SAMPLE-001` in the [operating brief](groupbasket.md) and `DEC-009` in
[decisions](../../docs/decisions.md). Pre-purchase group sample delivery is separate
from factory test-piece procurement, paid clothing orders and premium gifts. The group
pays transport; there is no sample sending fee. `src/server/samples.ts` locks requests,
checks the group owner and records transport-quote acceptance before warehouse dispatch.
Buyer `/samples` and warehouse `/admin/warehouse` share the request and tracking record.
Do not invent sample ownership, return, deposit or loss/damage policies.
