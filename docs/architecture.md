# Architecture reference

Brand partnership communication (2026-10-26) uses `BrandConversation`, `BrandMessage`, `BrandConversationRead` and `BrandOfferRevision`. `brand-communications.ts` validates each subject and actor, locks conversations for read/notification consistency and deduplicates sends by request key. Business services append events within their transaction; notice delivery runs after commit and retries on workspace visits or the sweep endpoint. `brand-reviews.ts` activates explicit approved revisions without changing prior gift price snapshots. The admin brand workspace is separate from factory Offers, and partnership messages are separate from shopper chat.

This describes the source tree inspected on 2026-10-24, with premium rewards updated on 2026-10-25. The [main agent brief](../.claude/agents/groupbasket.md) owns business policy; this document explains the implementation. Gifts support manual assignment, reservations and brand fulfilment/settlement records. Automatic family eligibility and body-measurement recommendations remain planned.

## Application structure

- Next.js App Router, React, Tailwind, Prisma with PostgreSQL, zod, and decimal.js. Declared dependencies and scripts are in [package.json](../package.json); consult the lockfile or installed packages for resolved versions.
- Pages and route handlers: `src/app/`. Server actions validate requests and call services in `src/server/`. Database-independent domain rules live in `src/lib/`, with adjacent unit tests.
- Most pages render on the server. Small client components handle forms, countdowns, charts, map pins, copy-link actions, toasts, and polling chat.
- PostgreSQL access is centralized in [db.ts](../src/server/db.ts). The Prisma client is generated into `src/generated/prisma`; edit the schema and migrations rather than generated files.
- Money is stored as `Decimal(14,2)` and calculated with `D` / `toD` from [decimal.ts](../src/lib/decimal.ts). Display and business-day helpers in [format.ts](../src/lib/format.ts) use Asia/Colombo.

Read the applicable installed Next.js guide under `node_modules/next/dist/docs/` before changing framework code, as required by [AGENTS.md](../AGENTS.md). Local setup and executable scripts belong in [README.md](../README.md) and [package.json](../package.json).

## Data model

The authoritative field definitions and constraints are in [schema.prisma](../prisma/schema.prisma).

| Domain                    | Tables and relationships                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity                  | `User` has `CUSTOMER`, `SELLER`, `ADMIN`, or `PACKER` role. Sellers may have `company`, `isBrand`, and `website`. `Session` stores a hash of the cookie token and an expiry.                                                                                       |
| Catalogue                 | `Product` has selling/retail prices, one photo, taxonomy, optional seller and lot links, and an optional brand product URL. `Variant` is unique by product, size, and colour and holds `available`, `reserved`, and `sold` counts.                                 |
| Purchasing and pricing    | `Lot` stores pieces, bulk cost, transport, wages, arrival, and a snapshot of pricing settings. `PriceChange` records a product's selling-price history.                                                                                                            |
| Supplier offers           | `StockOffer` belongs to a seller, has `TEST` or `BULK` kind, review status, optional product link, and receiving attribution. Brand offers additionally record retail price, purchase price, pieces, and a source URL.                                             |
| Shared orders             | `GroupCart` stores owner, share code, visibility, status, threshold and total, deadlines, and delivery details. `CartMember` stores membership and a location snapshot. `CartLine` is unique by cart, buyer, and variant, with quantity and a price snapshot.      |
| Payment                   | `PaymentSlip` stores uploaded evidence and `PENDING`, `APPROVED`, or `REJECTED` review state, reviewer, and reason. A rejected slip can be followed by a new upload.                                                                                               |
| Collaboration             | `CartMergeRequest` links source and target carts; the source link can become null after deletion. `CartMessage` is a private owner/participant thread with read tracking. `CartInvite` remains in the schema and services although its cart-page form was removed. |
| Fulfilment                | One `Delivery` per cart stores booking details and delivery state. One `Packing` record per gathered order records gathering, packing, and handover actors and times.                                                                                              |
| Configuration and notices | `Settings` is a singleton with order/payment windows, bank details, capacity, and lot pricing defaults. `Notification` stores in-app notices and read state.                                                                                                       |

Legacy schema values do not define the current product scope. `SHOES` still exists in the category enum, and `Product.status`, `reviewNote`, `stockType`, and `defectNotes` remain for compatibility. Current shop visibility uses free variant stock; there is no active draft/review/publish workflow for products. Stock-offer review is a separate, active workflow.

Added on 2026-10-25: `GiftOrder` snapshots the offering, basket, recipient, retail value and partner charge, with reservation/payment/dispatch/delivery/issue and bill-approval states. `GiftSettlement` records selected approved gift charges and an externally completed bank transfer. `StockOffer.paused` controls new gift reservations. No owned premium inventory, automated household qualification, measurements, refund or factory supplier ledger model is introduced.

Added on 2026-10-26: `StockOffer` stores gift photo key/type, contents, pack size, dispatch business days and applicable expiry/shelf-life metadata. The authenticated `/api/brand-photos/[id]` route uses `brandPhotoFor` to scope images to admins, the owning brand and assigned recipients; responses are private and not cached. `GiftProductDetails` renders these fields in product cards, admin reviews and recipient baskets. No delivery-charge columns or collection flow were added.

## Cart and fulfilment transitions

| Trigger                         | Cart transition                        | Stock effect                                                  |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Create a cart                   | → `OPEN`                               | None                                                          |
| Add or increase an item         | `OPEN` / `READY`, then recompute total | Move the additional quantity from available to reserved       |
| Cross the cart's saved minimum  | `OPEN` ↔ `READY`                       | No extra movement; notify on becoming ready                   |
| Owner accepts                   | `READY` → `AWAITING_SLIP`              | Keep reservations; freeze edits and snapshot delivery details |
| Owner uploads evidence          | `AWAITING_SLIP` → `SLIP_REVIEW`        | Keep reservations; payment timer no longer closes the cart    |
| Admin rejects evidence          | `SLIP_REVIEW` → `AWAITING_SLIP`        | Keep reservations; assign a fresh payment deadline            |
| Admin approves evidence         | `SLIP_REVIEW` → `CONFIRMED`            | Move reserved quantities to sold                              |
| Admin books delivery            | `CONFIRMED` → `DISPATCHED`             | None                                                          |
| Delivery completed              | `DISPATCHED` → `DELIVERED`             | None                                                          |
| Unaccepted cart deadline passes | `OPEN` / `READY` → `EXPIRED`           | Release reservations; retain lines as history                 |
| Payment-upload deadline passes  | `AWAITING_SLIP` → `CANCELLED`          | Release reservations; retain lines as history                 |
| Permitted cancellation          | Pre-confirmation state → `CANCELLED`   | Release reservations; retain lines as history                 |

The owner cannot cancel during `SLIP_REVIEW`; an admin can. Removing a line or leaving an editable cart releases the corresponding stock. An accepted merge moves existing lines without releasing their reservations. Cart services enforce one active cart per buyer.

`DISPATCHED` currently means a delivery has been booked; it does not prove the parcel has left the store. Physical handover is recorded by packing staff and changes `Delivery.status` to `PICKED_UP`. Order-board stages combine cart, packing, and delivery records. A failed or cancelled delivery can be booked again on the same record, clearing the prior handover attribution for another handover.

### Consistency mechanisms

- Cart and slip mutations use database transactions with a cart row lock (`SELECT … FOR UPDATE`). A guarded variant update requires enough available stock before reserving it.
- A per-user PostgreSQL advisory lock protects the one-active-cart check. Merge acceptance locks both carts in sorted order.
- Each line retains the product price from its creation. Later catalogue and lot repricing does not rewrite existing line prices.
- `sweep()` applies cart deadlines. A full sweep also calls `reduceDueLots()` for scheduled lot repricing. It runs on relevant page loads and through the authenticated cron route; notices are in-app only.
- Packing mutations lock the cart and enforce separate gatherer and packer identities. Sending back is allowed only before packing is finalized.

See [cart rules](../src/lib/cart-rules.ts), [cart service](../src/server/carts/service.ts), [slip service](../src/server/carts/slips.ts), [packing service](../src/server/packing.ts), and [delivery service](../src/server/delivery/index.ts) for exact guards.

## Routes by responsibility

The route tree in `src/app/` is authoritative. These are the main entry points, not a second specification of every field on each page.

| Audience            | Routes                                                                                                       | Current purpose                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visitors and buyers | `/`, `/shop`, `/products/[id]`                                                                               | Shopping home, catalogue, and product detail. Shop controls include search, audience, garment kind, and size; `?cart=CODE` carries cart context. |
| Visitors and buyers | `/carts`, `/c/[code]`                                                                                        | Discover public editable carts and view a shared cart by code. Discovery uses nearest-first when a buyer has a pin, otherwise newest-first.      |
| Buyers              | `/carts/new`, `/c/[code]/pay`                                                                                | Choose cart visibility; the name is derived from its owner. Payment page is for the owner awaiting upload.                                       |
| Buyers              | `/dashboard`, `/my-carts`, `/messages`                                                                       | Next actions, cart/order history, and private conversations with cart owners.                                                                    |
| Account holders     | `/account`, `/notifications`                                                                                 | Role-specific profile and in-app notices. `/account/location` redirects to `/account`, preserving return context.                                |
| Authentication      | `/sign-in`, `/sign-up`                                                                                       | Session entry and buyer registration.                                                                                                            |
| Sellers and brands  | `/seller`, `/seller/new`, `/seller/designs/[id]`                                                             | Factory offers/design insights; brand accounts receive Overview, Gift orders, Gift products and Settlements.                                     |
| Packing staff       | `/packing`, `/packing/[code]`, `/packing/stock/[id]`                                                         | Receiving queue, paid-order gathering/packing/handover, and accepted supplier-stock receipt.                                                     |
| Admin               | `/admin`, `/admin/lots`, `/admin/lots/new`, `/admin/lots/[id]`                                               | Stock dashboard and purchased-lot management.                                                                                                    |
| Admin               | `/admin/slips`, `/admin/orders`, `/admin/carts`, `/admin/carts/[code]`                                       | Payment review, fulfilment management, and cart inspection/cancellation.                                                                         |
| Admin               | `/admin/products`, `/admin/products/new`, `/admin/products/[id]`                                             | Product records and variant stock.                                                                                                               |
| Admin               | `/admin/offers`, `/admin/offers/[id]`, `/admin/brands`                                                       | Review factory/brand offers; factory receiving and product linking; manual gift allocation, bill approval and external transfer recording.       |
| Admin               | `/admin/users`, `/admin/users/[id]`, `/admin/users/new-seller`, `/admin/users/new-packer`, `/admin/settings` | Accounts, role provisioning, and configuration.                                                                                                  |

`/admin/packing` redirects to the orders board's in-store stage; `/admin/deliveries` redirects to `/admin/orders`. Seller and packing accounts are redirected away from buyer workflows; admins use their own catalogue and cart management routes. Protected pages/actions use role guards in [session.ts](../src/server/auth/session.ts).

Sharing currently uses the buyer dashboard's copy-link action. Cart-page invite and WhatsApp controls described in older notes are not current UI.

### HTTP endpoints

| Endpoint                             | Access and purpose                                                      |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `GET /api/photos/[id]`               | Public product photo with ETag caching                                  |
| `GET /api/slips/[id]`                | Uploader or admin; private payment evidence, no-store                   |
| `GET /api/suggest`, `GET /api/sales` | Public product suggestions and sales summary                            |
| `GET /api/chat`                      | Signed-in conversation access with service-level participant checks     |
| `GET /api/admin/carts/suggest`       | Admin cart search suggestions                                           |
| `GET /admin/export/orders`           | Admin orders CSV; download linked from the stock dashboard              |
| `GET /notifications/[id]`            | Signed-in user's notice read/redirect handler                           |
| `POST /api/cron/sweep`               | Bearer `CRON_SECRET`; deadline and lot-price sweep                      |
| `POST /api/webhooks/pickme`          | HMAC-checked delivery callback; integration payload remains provisional |

## Service and verification map

Paths below are relative to the repository root.

| Area                        | Implementation                                                                                                   | Existing verification                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Carts, reservations, merges | `src/server/carts/service.ts`, `queries.ts`, `actions.ts`; `src/lib/cart-rules.ts`, `distance.ts`, `location.ts` | Adjacent unit tests; `tests/integration/carts.int.test.ts`, `merge.int.test.ts`, `open-carts.int.test.ts` |
| Payment and delivery        | `src/server/carts/slips.ts`, `src/server/delivery/`; admin actions                                               | `tests/integration/carts.int.test.ts`, `admin.int.test.ts`                                                |
| Offers and receiving        | `src/server/offers.ts`, `receiving.ts`, `seller-actions.ts`                                                      | `tests/integration/seller.int.test.ts`, `receiving.int.test.ts`                                           |
| Brand offers                | `src/server/brands.ts`, `src/lib/brand-rules.ts`                                                                 | Brand-rule unit tests; `tests/integration/brands.int.test.ts`                                             |
| Design performance          | `src/server/designs.ts`, `prices.ts`, `src/lib/design-rules.ts`                                                  | Design-rule unit tests; `tests/integration/designs.int.test.ts`                                           |
| Catalogue and stock         | `src/server/catalogue.ts`, `lots.ts`, `stock.ts`, `admin-queries.ts`; `src/lib/stock-rules.ts`, `taxonomy.ts`    | Adjacent unit tests; `tests/integration/admin.int.test.ts`, `lots.int.test.ts`, `suggest.int.test.ts`     |
| Packing and order board     | `src/server/packing.ts`, `packing-actions.ts`, `orders.ts`, `src/lib/packing-rules.ts`                           | Packing-rule unit tests; `tests/integration/packing.int.test.ts`                                          |
| Chat and notifications      | `src/server/carts/chat.ts`, `src/server/notify/index.ts`; chat client polls while visible                        | `tests/integration/chat.int.test.ts`, `messages.int.test.ts`                                              |
| User experience             | `src/app/`, `src/components/`, `src/server/flash.ts`                                                             | `tests/e2e/journey.spec.ts`                                                                               |

The existence of a test file does not establish that the suite has passed in the current checkout. Use the checks appropriate to a change and report what was actually run.

## Deployment boundaries and known gaps

Development-only tools and CI live in [development tooling](development-tooling.md). Test
entry points share `scripts/test-database.mjs`; each serial browser spec owns its fixtures.
The optional inspection role reads sanitized views in `groupbasket_ai`, outside Prisma's
application schema. These tools do not add production integrations or deploy the application.

- **Delivery:** manual booking is the default. The PickMe provider request fields and webhook payload/authentication assumptions need to be matched to the actual business integration before enabling it. `DropRequest` currently carries a text address, city, contact, and item count, but not the saved latitude/longitude.
- **Uploads:** [storage](../src/server/storage/index.ts) uses local disk via `STORAGE_DIR`, with a 5 MB limit. Photos support JPEG/PNG/WebP; payment evidence also supports PDF. Hosting has not been selected; ephemeral/serverless storage would require another adapter.
- **Scheduled work:** deploy an authenticated recurring sweep for timely expiry notices and scheduled price updates. Page-triggered sweeps provide a fallback; there is no always-on worker.
- **Notifications:** [notify](../src/server/notify/index.ts) writes database notices. No email, SMS, or WhatsApp delivery integration is implemented. Older references to expiry emails are stale.
- **Brand rewards (updated 2026-10-25):** `src/server/gifts.ts` implements cart/offer-locked reservations, availability controls, brand-scoped dispatch, bill approvals and duplicate-safe settlement recording. `src/server/gift-actions.ts` enforces roles on actions. `/seller` renders `brand-dashboard.tsx` for brands; `/admin/brands` supports manual allocation and reconciliation. Cart payment approval activates reservations atomically; closing/leaving/reducing clothing releases them and merging preserves them. Brands are excluded from shop listing/linking and factory receiving. Automated eligibility, household verification, fee collection and actual bank/courier operations remain outside the implemented flow.
- **Demand analytics:** design insights aggregate current/historical cart lines, including unpaid expired carts, and distinguish paid purchases. They are not a complete append-only history of every add/remove action or a guarantee of future demand.
- **Authentication and accounts:** cookie sessions use `gt_session`, hashed tokens, and server-side role checks. Password reset is not implemented. Demo accounts come from the seed; their visibility is controlled by development mode or `SHOW_DEMO_LOGINS`.

Configuration variable names are listed in [.env.example](../.env.example). Never copy live secrets into documentation. The main brief and its implementation-status reference own prioritization and any business decisions required to close these gaps.

## Administrative workspaces

`User.adminArea` is `PREMIUM`, `FACTORY` or `WAREHOUSE` for admins and null for everyone else; there is no unrestricted admin (migration `remove_unrestricted_admin` turned former `ALL` admins into warehouse admins). `src/lib/admin-access.ts` holds `adminAreaOf`, `canAdminArea` and `userAdminArea` (the area that manages an account: brands PREMIUM, factory sellers FACTORY, buyers and packers WAREHOUSE, admins their own area). `requireAdmin(area)` protects area pages and actions; `requireAnyAdmin()` serves the shared Users and Settings pages, which `src/server/admin-users.ts` (`areaUsersWhere`, `assertManagesUser`) and per-area settings forms scope to the signed-in area. Sign-in sends each admin to `/admin/brands`, `/admin/factory` or `/admin/warehouse`, and the admin layout shows only that area's tabs and badges. The Stock dashboard (`/admin`) and stock/lot-margin settings are FACTORY; cart/payment/bank settings and the orders CSV export (from Orders) are WAREHOUSE. Each area creates admins only for itself; `npm run admin:create` (`scripts/create-admin.ts`) creates a deployment's first admins.

The factory workspace owns offers, design/product linking, variant stock and purchased lots. Its collection queue links the factory contact to the accepted `StockOffer`; warehouse receipt records `receivedBy` and `receivedAt` on that same offer. Received offers awaiting product linking return to the factory queue. Factory sellers retain only their own offers and aggregate design insight, without buyer identities or individual carts. Premium gift stock stays outside factory receipt and warehouse inventory.

Warehouse administration owns clothing payment review, order inspection, delivery booking and operational oversight. Packing staff retain the existing separate-person gathering/rechecking and handover workflow. Premium administrators manage partner products, gifts, private partnership communication and settlement reconciliation. Staff notifications target the responsible operational area only, so recipients receive links to their permitted workspaces.

## Pre-purchase design samples

`SampleRequest` links a group, apparel product and requesting group owner, snapshots the
owner's delivery address/pin and records the transport quote and acceptance separately
from clothing checkout. The request lifecycle is REQUESTED -> QUOTED -> ACCEPTED ->
DISPATCHED -> DELIVERED, with decline before acceptance. `src/server/samples.ts` serializes
requests with the group lock and transitions with the sample-row lock; no sample sending
fee, clothing stock reservation or checkout total is added. `/samples` scopes history to
current group members; only the requester accepts transport. `/admin/warehouse` and its
actions require WAREHOUSE access. Courier operations and transport payment remain external.

Group merges move sample request records to the destination group before source deletion, preserving requester, delivery snapshot, accepted transport and tracking history.

## Factory partnership joining (Part 1)

Applications hold private business, identity and bank fields. FactoryDocument stores private storage keys, exposed only through the FACTORY/CORE checked `/api/partner-docs/[id]` route. `partners.ts` validates submissions and serializes review/invite consumption; `partner-actions.ts` derives principals from sessions. `/factories/apply` and its invite route share the form; `/admin/factory/applications` holds review and visits. Approval links use separate hashed seven-day `FactoryActivation` rows (owner, creating admin, expiry and used-at audit). No activation is accepted by session lookup. Approval creates these only for new owners and returns the raw URL once in the authorized admin action response; form state displays it until navigation/refresh. Notifications persist only `/sign-in`. New sign-in link requires FACTORY/CORE access, approval and activation history; it locks the owner and invalidates unused activations before issuing a replacement. Redemption locks the owner then the activation (`FOR UPDATE`), checks unused/unexpired/account conditions, and atomically sets the password and used-at marker; the action then starts a normal session. GET never consumes credentials. Legacy applicants receive no activation. Migration cleanup hashes historical notification URL tokens to revoke only matching unredeemed approval sessions and sanitizes those URLs. It preserves invalidated hash-only activation history only for owners created after their application, excluding pre-existing legacy owners. Delivery uses in-app notices only. FactoryProfile, AgreementVersion and AgreementAcceptance retain lifecycle records alongside the factory User.


### Agreement eligibility

`src/lib/agreement-rules.ts` owns the pure calendar/eligibility/reminder rules; `src/server/agreements.ts` persists versions and acceptances. Publication and acceptance share an advisory transaction lock; acceptance also locks the factory profile. Published versions are append-only through services/actions. Forms bind acceptance to the version displayed. `canSell` resolves the factory account/profile/current acceptance and requires legacy checks after the grace deadline. `sellingFactoryWhere` expresses the same visibility in database queries, before limits and facet aggregation. `IN_SHOP` remains the administrative stock/status baseline, not a complete public eligibility predicate. Public catalogue queries compose eligibility with `AND: [...IN_SHOP.AND, eligibility]` so the brand exclusion is independent of the factory predicate. Direct detail lookup reuses only the base AND boundary, preserving access to sold-out ordinary products.

Listing/staff services, admin republishing and positive `setLine` changes and starting payment from an unpaid cart enforce the gate. Existing cart-row/user locks and guarded stock updates are preserved. Full `sweep()` calls claim reminder markers then deliver notices with deterministic IDs, allowing retries without duplicate notices; reads of current terms and delivered notices are batched. Agreement expiry never changes paid-cart rows or prices. Seller route URLs are unchanged; `(workspace)/layout.tsx` gates owners while `/seller/agreement` remains outside that group. Staff fulfilment and brand routes remain available.

## Password sign-in rate limiting

`authenticate(email, password, now)` in `src/server/auth/service.ts` normalises email,
checks `LoginAttempt` with a plain query, then looks up the user and verifies the password
without holding a transaction or pooled connection. There is no advisory lock. A single
parameterised upsert records each failure, restarts expired locks at one failure and preserves
an active lock's deadline. Successful sign-in deletes the counter with `deleteMany`.
`LoginAttempt` is independent of `User`, so unknown emails use the same counters and deadlines
and retain dummy-hash protection. Attempts already past the initial check when the fifth
failure lands may finish, allowing extra guesses in a burst; failure recording remains atomic.
`AUTH-001` owns the rule; the table has no reader grants. Coverage in
`tests/integration/login-lockout.int.test.ts` includes a 30-attempt pool regression that keeps
verification pending and requires an unrelated `SELECT 1` to finish in under 200 ms.
