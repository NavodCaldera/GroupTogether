---
name: carts
description: "Shared-cart lifecycle, stock reservation, deadlines, discovery and merging for GroupBasket. Use for cart rules, services, queries and actions."
---

# Carts

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Domain rules: `src/lib/cart-rules.ts`, `distance.ts`, `location.ts`.
- Services: `src/server/carts/service.ts`, `queries.ts`, `actions.ts`, `invites.ts`.
- Owner chat is owned by [notifications](notifications.md); payment review by [payments-slips](payments-slips.md).
- Policy references: `INV-001`, `CART-001`?`CART-005`, `LOC-001`, `PAY-001`/`PAY-002`, `GIFT-003`.

## Implementation guards

- Mutate under `db.$transaction` and `lockCart()`; recheck state and deadlines after acquiring the lock.
- Reserve on add with a guarded atomic available-to-reserved update. Quantity changes reserve/release only the delta; insufficient free stock fails without partial changes.
- Only unexpired OPEN/READY carts are editable. `setLine(..., { add: true })` adds to the current quantity, subject to the existing limit.
- `assertOneCart` uses a per-user advisory lock in create/join/add paths. Only CUSTOMER accounts may participate.
- `recompute()` updates totals and applies `statusAfterChange` only to editable carts. Send ready notices to members after commit on each crossing to READY.
- `acceptAndPay` is owner-only, freezes edits and snapshots profile delivery details. Use the cart's minimum snapshot and configured windows, not fixed 50,000/24h/2h assumptions.
- `close()` releases stock and retains history. Owner cancellation excludes SLIP_REVIEW; admin cancellation includes it.
- `sweep(now, cartId?)` rechecks `overdue()` under lock. A full sweep also runs due lot repricing. Keep cron and page-load entry points consistent.
- Merge acceptance locks both carts in sorted id order, moves items without releasing reservations and recomputes both totals. Delete an owned source only when it has no other members.
- Membership stores address/city/pin snapshots; missing profile locations route to account completion. Never expose exact owner coordinates through discovery.
- Preserve gift reservation hooks on close/leave/reduce/merge. [brands-rewards](brands-rewards.md) owns their financial and fulfilment behavior.

## Queries and interface boundaries

`recentCarts` discovers public editable carts, with nearest-first sorting when a buyer has
a pin, unknown distances last and newest-first fallback. `joinableCart` supports product
cart context; `editableCartsFor` supplies available destinations. Names derive from owners.
Sharing uses the dashboard copy-link action. Legacy invite services remain, but the
cart-page invite/share controls are removed; invitations create in-app notices only.

## Verification and coordination

Use adjacent cart, dashboard-step, distance and location unit tests plus
`tests/integration/carts.int.test.ts`, `merge.int.test.ts` and `open-carts.int.test.ts`.
Pass explicit `now` values for time-sensitive checks. Cover concurrent reservation,
deadline boundaries, merge authorization and gift reservation effects when affected.
Coordinate payment changes with [payments-slips](payments-slips.md) and UI changes with
[frontend](frontend.md); see [qa-review](qa-review.md) for command selection.

## Group design samples

Follow `SAMPLE-001` in the [operating brief](groupbasket.md) and `DEC-009` in
[decisions](../../docs/decisions.md). Pre-purchase group sample delivery is separate
from factory test-piece procurement, paid clothing orders and premium gifts. The group
pays transport; there is no sample sending fee. `src/server/samples.ts` locks requests,
checks the group owner and records transport-quote acceptance before warehouse dispatch.
Buyer `/samples` and warehouse `/admin/warehouse` share the request and tracking record.
Do not invent sample ownership, return, deposit or loss/damage policies.

Preserve sample request history on merges: move source records before deleting an owned source cart; moving a member preserves that requester's records. Never rewrite sample destination snapshots or accepted transport.

## Part 2 token locking foundation

Cart/payment mutations use `withCartTransaction` from `src/server/carts/locks.ts`: sorted user
advisories (same namespace as the active-cart guard), then sorted cart rows, then sorted ledger
User rows. Changed membership snapshots retry before any ledger mutation. Never take a new user
advisory after a cart row. `src/server/tokens.ts` appends signed ledger entries; HOLD debits once,
RELEASE credits unused amounts, and SPEND is a zero-delta marker. Stable event keys and line
revisions allow a later hold while deduplicating retries. Ledger rows cannot be updated/deleted.

## Part 2 token lifecycle and verification

`setLine` releases excess tokens before lowering quantity; remove/leave/close paths release
unused holds inside their cart transaction. Rejected slips keep holds. `approveSlip` appends
zero-delta SPEND markers; the original HOLD remains the only debit. Merges preserve line IDs.
`amountDue` drives transfer/slip/dashboard amounts; readiness and stock retain gross snapshots.
Only a customer's own line can apply tokens; account balance/history are principal-scoped.
Verify `tests/integration/tokens.int.test.ts`, `tests/integration/carts.int.test.ts`, the fixed-seed
`src/lib/cart-money.property.test.ts` and `tests/e2e/commission-tokens.spec.ts` (360px, keyboard, axe).

## Zero-due confirmation (DEC-013, approved 2026-11-05)

`acceptAndPay` computes `amountDue` under the cart lock. Exactly zero confirms immediately;
positive amounts retain AWAITING_SLIP. `src/server/carts/confirmation.ts` owns the shared
`confirmPaidCart(tx, cartId, actorId, now)` and after-commit `notifyCartConfirmed(cart)` used
by acceptance and slip approval. Confirmation spends once, sells reservations, activates gifts
and appends brand events. Do not loosen token-spend guards or send the owner-is-paying notice
for zero-due carts. Acceptance records delivery details and timestamps, with no PaymentSlip or
slip deadline. Verify the zero/one-cent/race cases in `carts.int.test.ts`, gift/factory effects in
`gifts.int.test.ts`, and the no-slip/pay-route redirect in `commission-tokens.spec.ts`.

## Member done before finish (CART-006, DEC-014)

`CartMember.doneAt` is nullable. Self-only `markDone`/`undoDone` and owner-only `removeMember`
live in `src/server/carts/service.ts`, with session-scoped actions and the shared cart lock order.
Only non-owner members with lines block acceptance. Recheck inside the transaction, regardless
of the disabled UI. Line deltas, actual token holds/releases, gift reservation changes and merge
arrivals reset Done atomically (`src/server/carts/member-done.ts`). Removal uses `releaseLines`,
refuses done/owner targets, recomputes readiness and notifies after commit; rejoining is allowed.
Everyone is done is emitted once per incomplete-to-complete transition, and Undo permits another.
Phone controls use existing primitives: Done/Undo on own section, status badges, two-step Remove
and the required-member completion count. Verify carts/gifts integration tests and the updated
`journey.spec.ts`/`commission-tokens.spec.ts` browser flows at 360px.

## Quality cancellation (Part 3)

`cancelPaidLines` in `src/server/cancellations.ts` requires participant advisories and the cart
row, then sorted ledger users. Only ACTIVE lines in CONFIRMED/DISPATCHED carts cancel; delivered
lines are untouched. Credit the full captured line price once, decrement sold, never restock
hidden goods. Preserve stored cart.total; display projections and packing/factory lists exclude
CANCELLED lines. Call `flushCancellationNotices` after commit; durable markers/stable IDs make
retries safe. A fully cancelled dispatched cart retains Delivery and alerts WAREHOUSE admins,
without calling the provider. See `tests/integration/cancellations.int.test.ts`.
