---
name: brands-rewards
description: "Premium-brand submissions/reviews, complimentary gift reservations, direct fulfilment, private photos and Sunday settlement reconciliation for GroupBasket."
---

# Brands Rewards

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Offers/reviews: `src/server/brands.ts`, `brand-reviews.ts`, `src/lib/brand-rules.ts`.
- Gifts and money: `src/server/gifts.ts`, `gift-actions.ts`, `src/lib/gift-rules.ts`.
- Photos: `src/server/brand-photos.ts`, `src/app/api/brand-photos/[id]/route.ts`.
- Workspaces: `src/app/admin/brands/`, `src/app/seller/brand-dashboard.tsx`, `brand-offer-form.tsx`; shared brand/reward/gift components.
- Partnership messaging is owned by [notifications](notifications.md); schema by [backend-data](backend-data.md).
- Policy references: `BRAND-001`?`BRAND-004`, `GIFT-001`?`GIFT-003`, `DATA-001`, `COM-003`. Open details: `DEC-002`?`DEC-004`.

## Premium administration and stakeholder handoffs

- Premium operations use `User.adminArea = PREMIUM`; there is no unrestricted admin. Premium admins also list, lock and create premium-brand accounts and add premium admins (`ADMIN-002`). Factory and warehouse admins cannot read premium private photos, enter brand conversations, review submissions, allocate gifts, approve bills or record settlements. Guard pages/actions with `requireAdmin("PREMIUM")` and enforce the same boundary in services.
- `/admin/brands` is the premium admin workspace; `/seller` remains the supplying brand workspace. Partnership notices route only to unlocked `PREMIUM` admins and the owning brand. Unpaid recipient details stay hidden from brands.
- Clothing payment approval activates reserved gifts through the existing transaction; premium admins inspect only the basket/member data needed for manual eligibility. Brands dispatch gifts directly, so no warehouse packing or sample shipment is created for a premium gift.
- Apparel sample requests belong to factory/warehouse operations; follow the operating brief for the group-paid transport and no sample sending fee policy.

## Submissions and review

- Gifts are complimentary, held/shipped by the supplying brand and separate from ordinary clothing stock. No factory receiving, public discounted resale or shop-product linking.
- Validate brand website/product-link ownership and the existing price rules. Partner price is private; genuine retail value is customer-facing. Price times quantity is capacity value, not a bill.
- New/revised submissions require photo, contents, pack size, dispatch business days, retail/partner prices, gift quantity and the brand's HTTPS product link. Description is optional; expiry/shelf-life metadata is conditional. Omit delivery-charge fields.
- Photos accept JPEG/PNG/WebP up to 5 MB. Admin, owning-brand and assigned-recipient access only; private/no-store responses. Retain existing photos on revisions unless replaced; nullable legacy metadata stays readable.
- Keep immutable submission revisions and named review events. Approve/request-changes/decline are distinct; requests for changes require reasons and stale reviews fail.
- Existing approved terms remain live until a new revision is approved. New terms apply to future gifts; never rewrite prior gift snapshots. Quantity/pauses are independent availability controls.

## Reservation and fulfilment

- Eligibility is manually confirmed by admins. Do not invent spend thresholds, household verification or automatic host gifts.
- Reserve under cart/offer locks, respecting campaign capacity, pauses and duplicate recipient/basket guards. Available quantity excludes non-cancelled allocations.
- Unpaid gifts reduce availability; brands receive aggregate reservation counts without recipient information or dispatch authorization.
- Preserve gift hooks on removal, leaving, expiry/cancellation, clothing quantity reductions and merging. Reductions release the recipient's gift for manual reassessment; merges move it with their items.
- Verified clothing-payment approval atomically moves RESERVED gifts to READY. Snapshot retail value, partner charge and recipient details.
- Only the owning brand acts on paid gifts. Record acknowledgement, courier/tracking, delivery or issues; actual courier work remains external. Customers pay separate gift delivery; amount/collection and exceptions remain open.

## Bills and settlement

- Unpaid reservations are not bills. Admins explicitly approve paid gift bills; unresolved delivery issues block unsettled bills.
- Record external Sunday transfers in Asia/Colombo against selected bill IDs and a reference. Row locks/constraints prevent duplicate settlement; do not add automatic bank transfers or a factory supplier ledger.
- Brand receipt confirmations/payment queries and admin query resolutions preserve charge/transfer records. Conversation resolution does not resolve financial or fulfilment state automatically.
- Keep each brand's recipients, charges and history scoped server-side. Brands never gain clothing-cart details, other-brand data or internal admin notes.

## Verification and coordination

Use brand/gift unit tests, `tests/integration/brands.int.test.ts`,
`gifts.int.test.ts`, `brand-communications.int.test.ts` and
`tests/e2e/brand-dashboard.spec.ts` as affected. Focus on concurrent capacity, payment
activation, revision snapshots, unpaid recipient privacy, other-brand denial and settlement
duplication. Coordinate cart hooks with [carts](carts.md), approval with
[payments-slips](payments-slips.md), communication with [notifications](notifications.md)
and mobile/forms with [frontend](frontend.md). Follow [qa-review](qa-review.md).
