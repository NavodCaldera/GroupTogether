---
name: payments-slips
description: "Owner bank-transfer evidence, private slip access and admin payment review for GroupBasket."
---

# Payments Slips

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Planned replacement (owner decision, 2026-11-07, not built yet)

Bank slip upload is to be removed in favour of gateway-only payment. Gateway, payer and timers are
undecided. The guidance below describes today's live code until the replacement is approved and built.

## Ownership and code

- Service: `src/server/carts/slips.ts`.
- Buyer payment: `src/app/c/[code]/pay/page.tsx`, `SlipForm` in `cart-forms.tsx`.
- Review: `src/app/admin/slips/page.tsx`, `slip-decision.tsx`; admin actions in `src/server/admin-actions.ts`.
- Private files: `src/app/api/slips/[id]/route.ts`, storage adapter in `src/server/storage/`.
- Policy references: `PAY-001`?`PAY-003`, `INV-001`, `BRAND-003`, `GIFT-003`.

## Implementation guards

- Bank transfer is the payment method. Only the owner uploads evidence for the whole cart.
- Validate JPEG/PNG/WebP/PDF and the 5 MB limit with `checkUpload(file, SLIP_TYPES)`. Check eligibility before file storage and again under the cart lock.
- Upload requires AWAITING_SLIP before its deadline; create a PENDING slip at the transfer amount due and move to SLIP_REVIEW, stopping timeout cancellation.
- Approval atomically marks the slip APPROVED, confirms the cart, records `confirmedAt`, moves reserved stock to sold and activates reserved gifts. Notify members and packing staff after commit.
- Rejection requires a reason, marks the slip REJECTED and restores AWAITING_SLIP with a fresh configured window. Preserve rejection history for the next upload.
- Repeated review must fail. The owner cannot cancel during review; admin cancellation follows the canonical cancellable states.
- Files are scoped to uploader/admin, served with no-store and sandbox CSP, and stored under `slips/<cartId>/` in the configured storage directory.
- Bank details come from Settings; missing setup must not present invented payment instructions.
- Preserve current refund scope under `PAY-003`; unresolved exceptions belong in `DEC-005`.

## Review interface

The queue is oldest-first, with desktop side-by-side review and separate mobile screens.
Images can open full size; PDFs open in a new tab because of the sandbox policy.
Approval requires the existing confirmation interaction. Success uses a toast and links
to booking in `/admin/orders?stage=to-book`, then the next slip. Booking is owned by
[delivery](delivery.md), not the cart inspection page.

## Verification and coordination

Use payment cases in `tests/integration/carts.int.test.ts` and `admin.int.test.ts`,
plus `gifts.int.test.ts` when changing approval hooks. Check owner/admin access, file
privacy, duplicate review, rejection windows and atomic stock/gift activation.
Coordinate lifecycle changes with [carts](carts.md) and gift changes with
[brands-rewards](brands-rewards.md). See [qa-review](qa-review.md) for commands.

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
