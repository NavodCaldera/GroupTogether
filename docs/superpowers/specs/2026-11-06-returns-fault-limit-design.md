# Returns rebuild and factory fault limit: design

**Date:** 2026-11-06. **Status:** approved by the owner in conversation (2026-11-06).
**Spec:** [factory partnership spec](../../../specs/001-factory-partnership/spec.md): User Story 7,
User Story 8, FR-019a, FR-021, FR-030, FR-034 to FR-038 and the 2026-11-06 clarifications.
**Brief:** [brief](../../../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-04/brief.md),
the "Decided on 6 Nov 2026" section.

## Intent

GroupBasket wants to be strict with factories. A factory has 24 hours to answer a return. Each item
confirmed as the factory's fault is one fault. The 2nd fault within 12 months hides the factory
straight away. An admin then talks with the factory and decides whether it continues or is removed.
To keep things simple, an ordinary product hide never changes a finished cart. Only a fault hold
or a removal cancels carts, and never once PickMe is booked.

## Goals

1. 24-hour factory answer; admins notified of and able to view every return from filing.
2. Fault records per item, cancellable by an admin, counted over the last 12 months.
3. Automatic fault hold on the 2nd counted fault, with a private factory thread and an admin
   decision (continue or remove).
4. One shared cart clean-up for fault holds and removals: cancel everything not yet booked with
   PickMe.
5. An ordinary product hide touches only OPEN/READY carts.

## Non-goals

- Factory payouts, the earnings release, and email/SMS.
- Changing the buyer's 48-hour window, the photo rule, "no sending before approval", tokens or the
  return thread.
- Automatic removal. Removal is always an admin decision.

## Anti-goals (a failure even if it "works")

- A cart already booked with PickMe being cancelled.
- A fault being counted twice for the same return, or a factory hidden twice for one hold.
- Tokens being given for an unpaid cart, or a paid cart cancelled without tokens.
- Products an admin hid for quality being shown again by a "continue" decision.

## Approaches considered

1. **Stored fault records and a stored hold (chosen).** A `FactoryFault` row per accepted
   factory-fault return, and a `FaultHold` row while the factory is hidden. These are needed
   because "continue", "cancel a mistaken fault", the thread and the history all need stored
   state.
2. **Fault count calculated from returns on every read.** There are no new tables, but there is
   no place for cancellation, the hold decision or the thread. Rejected.
3. **Reusing `FactoryProfile.status` for the hold.** It mixes up a temporary hold with removal and
   loses the decision history. Rejected.

## Design

### Data (one migration, `factory_fault_limit`)

- `FactoryFault`:
  - `id`, `factoryId` (the factory account user), `returnId` (unique), `units` (Int, the return's
    `qty`), `recordedAt`, `confirmedBy` (`FACTORY` | `ADMIN`) and `confirmedById`;
  - `cancelledAt?`, `cancelledById?`, `cancelNote?`.
- `FaultHold`:
  - `id`, `factoryId`, `openedAt`, `cleanedAt?` (set when the cart clean-up has finished),
    `decision?` (`CONTINUE` | `REMOVE`), `decisionNote?`, `decidedAt?`, `decidedById?`;
  - at most one open hold per factory (a partial unique index where `decidedAt IS NULL`).
- `FaultHoldMessage`: the same shape and limits as `ReturnMessage`, on a hold.
- `Product.hiddenByHoldId?`, so that "continue" un-hides only the products this hold hid.
- Do not grant any of these to `gb_ai_reader`. Re-run the refusal check for all three.

### Returns changes (`src/server/returns.ts`, `src/lib/return-rules.ts`)

- **Factory due time.** `fileReturn` sets `factoryDueAt = now + 24h`. The overdue check and
  `escalateOverdue` must use the stored `factoryDueAt`, not `createdAt`. Returns already open keep
  their stored 48h due time (Claude's call).
- **Notices at filing.** `fileReturn` also queues a "Return requested" notice to FACTORY/CORE
  admins.
- **Admin access.** Admin lists and detail include `WAITING_FACTORY` returns as view-only.
  `adminDecide` already refuses anything that is not `WITH_ADMIN`. Keep that.
- **Recording a fault.** Do this inside the same locked transaction that moves a `fault = FACTORY`
  return to `ACCEPTED`:
  - `factoryDecide(accept)` records it with `confirmedBy FACTORY`;
  - `adminDecide(accept)` records it with `confirmedBy ADMIN`;
  - for an admin accept after receipt, record it before `complete`.
  - Buyer-fault returns and rejections never record a fault.
  - The unique `returnId` makes a second attempt a no-op.
- **Opening a hold.** In the same transaction, count the uncancelled `units` with
  `recordedAt > now − 12 calendar months` (Claude's call: 12 months back by date). If the count is
  2 or more and no hold is open, create a `FaultHold`. Queue the hold notices: the factory owner(s)
  "Your shop is on hold", and FACTORY/CORE admins "Factory on hold".
  - Do not hide products or touch carts here. The return transaction already holds cart locks, and
    the factory's other carts must not be locked inside it.

### Enforcing a hold (new `src/server/fault-holds.ts`)

- `enforceHold(holdId)` runs after the return transaction commits. It is idempotent and is also
  called from `sweep()` for any open hold with `cleanedAt = null`.
  1. In one transaction, take the factory owner's advisory lock, then the `Product` rows in id
     order (the same as `removeFactory`). Set `hiddenAt`/`hiddenReason`/`hiddenByHoldId` on the
     factory's products that are not already hidden.
  2. Run the shared clean-up below for the factory's carts.
  3. Set `cleanedAt` and flush the notices.
- **Listing rules.** While a hold is open, the factory cannot publish or un-hide listings. Add the
  check to the existing selling-eligibility check (`canSellIn`, or whatever its callers use). Sign-in,
  `/seller/returns`, return threads and the hold thread keep working.

### Shared cart clean-up (replaces `cleanProducts` in `src/server/quality.ts`)

This is used by `enforceHold` and `removeFactory`. Every cart belongs to one factory. For each cart
holding the factory's ACTIVE lines, take one cart transaction at a time, using the existing
`withCartTransaction`/`lockCart` lock order:

| Cart status                                     | Action                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OPEN, READY                                     | Remove the lines through the existing hidden-line path (stock, token holds and gifts released, Done reset), with a notice to each line owner.                     |
| AWAITING_SLIP, SLIP_REVIEW                      | Cancel the whole cart unpaid: the existing unpaid-expiry release (stock, token holds released, gifts released), with no new tokens and a notice to every member. |
| CONFIRMED (paid, no PickMe booking)             | `cancelPaidLines` on all ACTIVE lines: full-price tokens per line owner, and the cart is cancelled when no ACTIVE lines remain.                                    |
| DISPATCHED, DELIVERED (PickMe booked or later)  | Untouched.                                                                                                                                                         |

- An unpaid cancelled cart ends `CANCELLED` (the existing state used when a slip is not uploaded in time) with the
  cancellation reason. Claude's call: this reuses tested release code, and no new status is needed.
- A slip uploaded for a cart that is then cancelled gets no review: approval must refuse a
  non-`SLIP_REVIEW` cart, which is already true.

### Ordinary product hide (`hideProduct`)

- Only OPEN/READY carts lose the hidden product. Every other cart is untouched.
- Remove the hidden-line cancellation from shared `confirmPaidCart`. An accepted cart with a hidden
  product now confirms normally. Update the tests and the DEC-013 text that relied on the old rule.

### The admin decision (`decideHold`)

- FACTORY/CORE only, with a required note of 1–2000 characters. The first action wins, through a
  row lock on the hold.
- **CONTINUE:** un-hide the products where `hiddenByHoldId = hold.id` (clear the three fields) and
  close the hold. Cancelled carts stay cancelled. Faults keep counting, so the next recorded fault
  while 2 or more are within 12 months opens a new hold.
- **REMOVE:** close the hold, then call the existing `removeFactory` with the note as the reason.
  This locks the staff and hands open returns to an admin. Its clean-up is the shared table above.
- **Hold refused during a removal:** a hold on a `REMOVED` factory is closed as `REMOVE`
  automatically, and no new hold opens for a removed factory.

### Cancelling a fault (`cancelFault`)

- FACTORY/CORE, with a required note. Set the `cancelled*` fields; the fault stays visible.
- It does not close or open a hold by itself.

### The hold thread

- Participants: FACTORY/CORE admins, and the factory's owners (the factory account plus
  `factoryRole = OWNER` staff).
- Posting is allowed only while the hold is open. The thread stays readable afterwards.
- The same limits and the same unread-notice pattern as `postReturnMessage`. Reuse its helpers;
  don't copy them.
- Everyone else gets 404: Sales, Packing and Planner staff, other factories, PREMIUM/WAREHOUSE
  admins and buyers.

### Pages (phone first, existing primitives, no explainer text)

- **`/seller/returns`, for owners only:** a faults list showing the date, items, the return and
  whether it was cancelled, plus a hold banner with a link to the hold thread.
- **`/admin/factory/quality`:**
  - open holds, with the thread and Continue/Remove buttons with a note;
  - each factory's faults, with Cancel and a note.
- **`/admin/factory/returns`:** show `WAITING_FACTORY` returns as view-only, with a due-time label.

## Locks and races

- Recording a fault and opening a hold happen inside the existing return transaction. The
  partial unique index on the open hold, plus a retry on unique violation as a no-op, stops two
  parallel accepts from opening two holds.
- Product hiding and cart clean-up never run inside a return or cart transaction that already holds
  locks. They follow the `removeFactory` pattern: the owner advisory lock and products first, then
  one cart transaction at a time.
- `decideHold` racing `enforceHold`: "continue" must wait for the hold row lock, and `enforceHold`
  skips a decided hold. A "continue" before the clean-up finishes un-hides only the products
  hidden by this hold. Carts cancelled before the decision stay cancelled.

## What is left to the builder

Component layout, query shapes, the exact notice text, and the test fixture names.

## Tests the plan must require

- **24h:** filing sets `factoryDueAt`. 24h plus 1 minute moves the return to admins. An old 48h
  return keeps its time.
- **Admin access:** admins are notified at filing and can view a `WAITING_FACTORY` return but can't
  decide it.
- **Faults:**
  - the factory accepts a factory-fault return of qty 3: 3 units and a hold;
  - a buyer-fault accept and a rejection record no fault;
  - a qty-1 fault, then another qty-1 fault 11 months later opens a hold; at 12 months and 1 day
    later it does not;
  - a cancelled fault does not count.
- **Cart clean-up** (each status in the table):
  - OPEN lines are removed;
  - an AWAITING_SLIP cart is cancelled, holds are returned, and no RETURN/CANCELLATION credit is
    made;
  - a CONFIRMED cart gives full-price credits per line owner;
  - DISPATCHED (BOOKED, PICKED_UP and FAILED) and DELIVERED carts are untouched.
- **Ordinary hide:** an AWAITING_SLIP, CONFIRMED or DISPATCHED cart with a hidden product is
  unchanged, and confirmation proceeds with the hidden line.
- **Continue/Remove:**
  - continue un-hides only the products hidden by this hold;
  - the next fault reopens a hold;
  - remove locks the staff.
- **Concurrency:**
  - two accepts that both reach 2 faults open one hold;
  - two `decideHold` calls produce one outcome;
  - `enforceHold` running twice gives one credit per line.
- **Access:**
  - the hold thread and the faults list are denied for the listed outsiders;
  - a factory on hold can't publish but can answer returns.
- **Browser:** the factory accepts a 2nd fault, the hold banner appears, the admin and the factory
  owner exchange a message, the admin chooses Continue, and the listings return. Desktop and 360px,
  with Axe.
- **Reader refusal** on all three new tables.
