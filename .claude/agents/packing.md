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
