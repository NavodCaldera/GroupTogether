---
name: catalogue-admin
description: "Clothing catalogue, variant stock, lot pricing, factory offers/design analytics and general admin for GroupBasket. Premium rewards have a separate specialist."
---

# Catalogue Admin

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Current model (2026-11-03)

Factories publish their own listings (`saveProduct` with `sellerId`, `src/app/seller/(workspace)/products/`) and see `src/server/factory-dashboard.ts`; admins hide listings with `ARCHIVED`, which `IN_SHOP` excludes. Ratings live in `src/server/ratings.ts` (`RATE-001`). Settings belong to the CORE admin (`ADMIN-002`).

## Ownership and code

- Catalogue: `src/server/catalogue.ts`, `src/lib/taxonomy.ts`, public photo/suggestion routes.
- Stock and lots: `src/server/stock.ts`, `lots.ts`, `lot-actions.ts`, `prices.ts`, `src/lib/stock-rules.ts`.
- Factories: `src/server/offers.ts`, `designs.ts`, `design-actions.ts`, `seller-actions.ts`, `src/lib/design-rules.ts`.
- General admin: `src/server/admin-actions.ts`, `admin-queries.ts`, `src/app/admin/`; factory UI: `src/app/seller/`.
- Policy references: `CAT-001`/`CAT-002`, `INV-001`, `LOT-001`/`LOT-002`, `SUP-001`?`SUP-003`, `DATA-001`, `UX-002`.

## Catalogue and pricing guards

- Direct non-brand factory listings snapshot `Settings.commissionPerPiece` at creation into `Product.commission`; `factoryPrice + commission` is stored in buyer-facing `Product.price`. CORE alone changes the setting. Existing-listing edits reuse the stored commission; own and lot pricing remain unchanged. See `src/lib/price-rules.ts` and `tests/integration/commission.int.test.ts`.

- Free variant stock controls ordinary shop listings, search, facets and suggestions. Product status/review columns are legacy, not a publish workflow.
- Ordinary product links may remain accessible without free stock. Brand-linked gift products are excluded from public catalogue/direct lookup and paid additions. Catalogue eligibility must append `...IN_SHOP.AND`, never overwrite it, including lists, suggestions, facets, savings and direct details. `tests/integration/catalogue-eligibility.int.test.ts` broadens factory eligibility to verify the independent brand boundary.
- Stock adjustments change available quantities only; never manually change reserved/sold counts or remove more free stock than exists.
- Stock-type and defect fields/badges are hidden. Edits retain stored type; new products default to FACTORY_SURPLUS. Legacy footwear enums do not authorize footwear work.
- Product photos support JPEG/PNG/WebP up to 5 MB; the public photo route uses ETags. Gift photos use a separate private route.
- Lots snapshot pricing settings, reprice linked products on cost edits and apply the scheduled reduction once. Existing cart-line prices stay fixed.
- Log price changes through `logPrices`. In-store counts include paid orders until physical handover and unlisted lot pieces; capacity is reporting, not automatic purchasing approval.

## Factory offers and design history

- Offer submission, admin decision, staff receipt, product linking and stock entry are separate steps. Offer acceptance/receipt never automatically publishes stock.
- Review uses guarded single decisions with optional notes and notifications. Packing owns receipt operations.
- Link only accepted factory offers to permitted factory/unowned products. Test and later bulk share one product/history; do not link another factory's design.
- Seller insights expose their own wanted/bought pieces, buyer counts, size performance and shop-price history, not buyer identities, carts or internal costs.
- Wanted counts derive from retained cart lines, including expired/unpaid carts; they are not guaranteed demand or a complete interest event log.
- Factory payments are external bulk purchases; do not introduce supplier balances. Premium gift bills are owned by [brands-rewards](brands-rewards.md).

## Factory staff

- Since 2026-11-04 (`FAC-001`) factory listings and stock are edited by the factory's Owner, Planner or Sales logins; pass `requireFactory("products").factoryId` as `sellerId`. Packing staff cannot edit listings.

## Admin boundaries

The factory admin landing page is `/admin/factory`, with accepted-stock collection and warehouse receipt queues. `User.adminArea` separates factory, premium and warehouse operations; use `requireAdmin("FACTORY")` on factory pages/actions. There is no unrestricted admin (`ADMIN-002`): the Stock dashboard (`/admin`) and store-size/lot-margin settings belong to FACTORY; the orders CSV export lives on warehouse Orders. Lots owns costs, Slips owns payment
review, Orders owns delivery, and Carts owns inspection/search/pre-confirmation cancellation.
Brands has its own workspace. Read the live route tree for the current tab list.

Enforce factory-area guards on catalogue/offer/design/lot queries/actions/routes. Factory notices go only to FACTORY admins; shared offer receiving attribution connects the factory and warehouse workspaces. Public signup creates buyers. Users and Settings are shared pages scoped by area (`requireAnyAdmin`, `src/server/admin-users.ts`): factory admins manage factory sellers, premium admins brands, warehouse admins buyers and packing staff, and each area adds only its own admins. First admins come from the seed or `npm run admin:create`. Locking a user removes
sessions, not their carts; admins cannot be locked. CSV output uses the existing formula
escaping and UTF-8 BOM. Preserve concise screens and flash success messages.

## Verification and coordination

Use adjacent taxonomy, stock/design/brand-rule and CSV-related tests as applicable, plus
`tests/integration/admin.int.test.ts`, `lots.int.test.ts`, `seller.int.test.ts`,
`designs.int.test.ts` and `suggest.int.test.ts`.
Coordinate receipt with [packing](packing.md), persistence with [backend-data](backend-data.md),
UI with [frontend](frontend.md) and gift flows with [brands-rewards](brands-rewards.md).
Follow [qa-review](qa-review.md) for checks.

## Group design samples

Follow `SAMPLE-001` in the [operating brief](groupbasket.md) and `DEC-009` in
[decisions](../../docs/decisions.md). Pre-purchase group sample delivery is separate
from factory test-piece procurement, paid clothing orders and premium gifts. The group
pays transport; there is no sample sending fee. `src/server/samples.ts` locks requests,
checks the group owner and records transport-quote acceptance before warehouse dispatch.
Buyer `/samples` and warehouse `/admin/warehouse` share the request and tracking record.
Do not invent sample ownership, return, deposit or loss/damage policies.

## Factory partnership joining

Task 1.1 adds `FactoryApplication`, `FactoryDocument`, `FactoryInvite`, `AgreementVersion`, `AgreementAcceptance` and `FactoryProfile`. Migration `factory_partnership_joining` grants existing seller owners a 30-day compliance window. `src/server/partners.ts` owns validation, transactional invite redemption/review and optional visits. Public forms are `/factories/apply` and `/factories/apply/[token]`; review is `/admin/factory/applications`. Only unlocked FACTORY/CORE admins can read `/api/partner-docs/[id]`, with all other callers receiving 404 before storage access. Submission and rejection share an advisory lock; review also locks its application row. Existing owner association comes from the session, never form data. Approval for new owners creates a single-use seven-day token stored hashed in `FactoryActivation`, never `Session`. Its raw URL is returned only in the approving admin action response; notifications link to `/sign-in`. FACTORY/CORE admins can issue a replacement after approval only before any owner redemption. Under the owner lock, any non-null activation `usedAt` refuses reissue; unused links are revoked using `revokedAt`, not `usedAt`. The admin detail page hides New sign-in link after redemption. Activation history distinguishes newly created owners from authenticated legacy applicants, whose passwords remain unchanged and who receive no activation. Redemption locks owner then activation, requires both `usedAt` and `revokedAt` null, and sets `usedAt` and the password atomically, before the existing action starts a normal session. The admin page never retrieves tokens from notifications. Migration cleanup revokes exact hash-matched historical approval sessions, sanitizes links and retains only invalidated new-owner activation history. The revoked-column migration leaves ambiguous historical `usedAt` values untouched; these conservatively block reissue. External delivery is not configured. `agreements.ts` owns `canSell`, CORE append-only publication, owner-only acceptance/renewal and reminder delivery. Public catalogue queries filter in the database before pagination; positive cart additions and starting payment check eligibility within the existing cart transaction. Seller listing/staff services and admin republishing also enforce the gate. Legacy grace alone is insufficient after its deadline: checks must be approved and the latest agreement accepted/unexpired. Paid carts are never expired or repriced by agreement logic. `/seller/(workspace)/layout.tsx` redirects blocked factory owners to `/seller/agreement`; shared seller components keep their existing paths. Brands and staff retain their existing workspace access. The first sign-in exchange sets the owner's chosen password. Tests: `partner-rules`, `agreement-rules`, `partners.int.test.ts`, `agreements.int.test.ts`, and the 360px `partners.spec.ts` journey.
