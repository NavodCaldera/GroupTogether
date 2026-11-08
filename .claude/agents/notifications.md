---
name: notifications
description: "In-app notifications, return and hold threads, and parked premium-brand partnership communication for GroupBasket."
---

# Notifications

## Return notices (Part 4)

`ReturnNotice` persists return events in the business transaction. `flushReturnNotices` runs
after commit and on overdue sweeps, with stable IDs deduplicating delivery retries. Filing
notifies owner/SALES, decisions/booking/receipt notify the buyer or other side, escalation
notifies FACTORY/CORE, and accepted factory-fault returns notify WAREHOUSE to book PickMe
externally. Removal suppresses queued factory notices and sends only buyer/admin handoff
notices. Return notices link to the buyer cart, `/seller/returns` or `/admin/factory/returns`.

Automatic factory refusal/used-receipt review notifies FACTORY/CORE and the buyer after
commit. `ReturnMessage` is private to own owner/SALES and FACTORY/CORE. Each message
queues the opposite side in ReturnNotice. Delivery and thread reads serialize on the return
row, giving each recipient at most one unread "New return message" notice per thread.
Opening the thread marks both existing notices and pending message deliveries read. Posting
uses the same sorted user-advisory/cart/return locks as decisions; the author advisory also
serializes the ten-per-minute limit across threads. Messages link to the admin detail or
`/seller/returns?return=id`; buyer notices remain on the buyer cart. No private body is put in
the notification preview. A receipt re-review has a separate decision event key so its final
result is delivered even if the earlier acceptance notice was already sent.

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Notices: `src/server/notify/index.ts`, `src/app/notifications/`, header bell.
- Owner chat is removed with group carts (`COM-002` retired); there is no buyer-to-buyer messaging.
- Brand communication: `src/server/brand-communications.ts`, `brand-communication-actions.ts`, shared `src/components/brand-*.tsx`.
- Policy references: `COM-001`, `COM-003` (parked), `ORD-005`, `BSK-006`, `RETURN-001`, `DATA-001`, `BRAND-004`.

## In-app delivery

- `notify(userIds, { title, body, href })` writes in-app rows after commit. No email, SMS or WhatsApp sending is implemented.
- Keep notices brief, actionable and linked to the correct role workspace. Verify recipients in the event's service rather than maintaining a competing event catalogue here.
- Area agent events: a verified payment, cancellation and expiry notify the buyer; Mark received sends each buyer their pickup code; courier booking and Given to driver notify the agent; return decisions and handover instructions notify the buyer and agent; payouts notify the factory Owner. All after commit.
- Factory offer/review/receipt notices stay separate from brand review, paid gifts and settlement notices.
- Notification read/redirect routes check ownership and same-site destinations. Use a plain anchor for `/notifications/[id]`: prefetch must not mark a notice read.

## Brand partnership communication

- Admin/owning-brand threads attach to product, paid gift, settlement or general context. Internal notes remain admin-only; unpaid gift threads and recipients are unavailable to brands.
- Persist messages and business events within their transaction. `flushBrandNotices` delivers deduplicated notices after commit and retries on workspace visits/sweep.
- Preserve conversation locks, request-key send deduplication and per-user monotonic read markers. Retrying a notice must not reopen something read through that message.
- Messages allow 2,000 characters and ten sends per minute. Shared needs-reply/resolved state does not settle money or resolve a gift issue.
- Visible-tab refresh preserves drafts. Mark read when the newest message is visible, never through server GET/prefetch.

## Verification and coordination

Use `brand-communications.int.test.ts`, `returns.int.test.ts`, `fault-holds.int.test.ts` and affected event-service tests.
Check participant isolation, role restrictions, internal-note privacy, retry deduplication,
read markers and draft preservation. Coordinate financial events with
[brands-rewards](brands-rewards.md) and rendering with [frontend](frontend.md).
See [qa-review](qa-review.md) for commands.

## Factory agreement reminders

`runSweep` calls `remindAgreements` in its `agreements` step and retries fault-hold enforcement in its `faultHolds` step (Task 18). Acceptance `remindedAt` claims are committed before notification delivery. `notify` accepts an optional deduplication key; reminders use deterministic per-term/per-owner notice IDs and retry missing deliveries, with batched term/notice reads. Approval uses an in-app notice plus an admin-reviewable one-time sign-in link; email/SMS delivery is not implemented. First sign-in sets the owner's password atomically with consuming the hashed token.

## Quality actions after the area agent model

`src/server/quality.ts` requires FACTORY/CORE principals in mutations and queries; flags are
read-time only. Since Task 18 hides, holds and factory removal no longer clean carts (none exist)
and `src/server/cancellations.ts` is gone. What they do to paid orders already in baskets is open
(`DEC-016`). Removal reuses session-ending account locks and sends no factory-user notice.
`QualityNotice` markers persist retries; flush only after commit. Verify `quality.int.test.ts`,
`fault-holds.int.test.ts` and `ratings.int.test.ts`.

## Returns rebuild and fault holds (2026-11-06)

Follow RETURN-001, QUAL-001 and FAULT-001. New factory deadlines are 24 hours; use stored
factoryDueAt. FACTORY/CORE admins see filing notices and view WAITING_FACTORY without deciding.
Accepted factory-fault quantities record once and may open a hold. `fault-holds.ts` enforces
after commit; sweep retries. Hold gates serialize decisions/enforcement; factory/product locks
release before participant/cart/ledger cleanup. Ordinary hides affect only OPEN/READY.
Shared cleanup cancels unpaid finished carts with reservation release and no new credit,
and CONFIRMED carts with full-price tokens. Booked/delivered carts stay untouched.
Continue restores only hiddenByHoldId products. Fault corrections retain audit without
closing holds. Own owners and FACTORY/CORE alone access hold threads; SALES keeps return
threads only. `private-thread.ts` shares limits and unread helpers. Verify fault-holds,
returns and quality integration tests plus the 1280/360px fault-hold browser journey.
