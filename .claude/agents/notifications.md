---
name: notifications
description: "In-app notifications, private owner chat and premium-brand partnership communication for GroupBasket."
---

# Notifications

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Notices: `src/server/notify/index.ts`, `src/app/notifications/`, header bell.
- Owner chat: `src/server/carts/chat.ts`, `src/app/api/chat/route.ts`, `src/app/messages/`.
- Brand communication: `src/server/brand-communications.ts`, `brand-communication-actions.ts`, shared `src/components/brand-*.tsx`.
- Policy references: `COM-001`?`COM-003`, `DATA-001`, `BRAND-004`.

## In-app delivery

- `notify(userIds, { title, body, href })` writes in-app rows after commit. No email, SMS or WhatsApp sending is implemented.
- Keep notices brief, actionable and linked to the correct role workspace. Verify recipients in the event's service rather than maintaining a competing event catalogue here.
- Ready/confirmed/expired/cancelled cart events notify applicable members; slip upload notifies admins, rejection notifies owner. Booking notifies owner/packers; handover notifies owner.
- Factory offer/review/receipt notices stay separate from brand review, paid gifts and settlement notices.
- Notification read/redirect routes check ownership and same-site destinations. Use a plain anchor for `/notifications/[id]`: prefetch must not mark a notice read.

## Private owner chat

- Threads are keyed by cart and participant. The owner replies, or initiates only with an eligible pending join requester; threads persist after that request is decided.
- Enforce participant checks server-side. Sellers and packing staff cannot send cart chat.
- Messages allow 500 characters and ten sends per minute. Deduplicate notices while a conversation notice is unread.
- `listMessages` records other-side reads and clears the notice; preserve sent/seen ticks and unread inbox counts.
- Use `conversationHref` for current `/messages?c=?&with=?` links. Poll only while the tab is visible.

## Brand partnership communication

- Admin/owning-brand threads attach to product, paid gift, settlement or general context. Internal notes remain admin-only; unpaid gift threads and recipients are unavailable to brands.
- Persist messages and business events within their transaction. `flushBrandNotices` delivers deduplicated notices after commit and retries on workspace visits/sweep.
- Preserve conversation locks, request-key send deduplication and per-user monotonic read markers. Retrying a notice must not reopen something read through that message.
- Messages allow 2,000 characters and ten sends per minute. Shared needs-reply/resolved state does not settle money or resolve a gift issue.
- Visible-tab refresh preserves drafts. Mark read when the newest message is visible, never through server GET/prefetch.

## Verification and coordination

Use `tests/integration/chat.int.test.ts`, `messages.int.test.ts`,
`brand-communications.int.test.ts` and affected event-service tests.
Check participant isolation, role restrictions, internal-note privacy, retry deduplication,
read markers and draft preservation. Coordinate financial events with
[brands-rewards](brands-rewards.md) and rendering with [frontend](frontend.md).
See [qa-review](qa-review.md) for commands.

## Factory agreement reminders

Full cart sweeps call `remindAgreements` after collecting current agreement terms. Acceptance `remindedAt` claims are committed before notification delivery. `notify` accepts an optional deduplication key; reminders use deterministic per-term/per-owner notice IDs and retry missing deliveries, with batched term/notice reads. Approval uses an in-app notice plus an admin-reviewable one-time sign-in link; email/SMS delivery is not implemented. First sign-in sets the owner's password atomically with consuming the hashed token.

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
