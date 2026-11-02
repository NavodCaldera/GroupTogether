# Implementation status

Last inspected: **2026-10-24**, from repository source and schema. This is a static inspection, not a runtime test result, deployment audit, or confirmation of commercial partnerships.

The [main agent brief](../.claude/agents/groupbasket.md) owns business policy. This file records what the code supports. Unresolved policy belongs in [business decisions](decisions.md). Update the affected row whenever implementation changes; an implemented feature does not override an approved business rule.

## Status meanings

- **Implemented:** the described code path and supporting data structures exist.
- **Partial:** part of the capability exists; the remaining work is named.
- **Not implemented:** the inspected application has no supporting workflow or data model.
- **Policy mismatch:** existing behavior differs from the documented business direction.

## Commerce and operations

| Capability                               | Status          | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clothing catalogue and business scope    | Policy mismatch | Clothing products, sizes, stock and prices exist in the [catalogue service](../src/server/catalogue.ts). The [home page](../src/app/page.tsx) still positions surplus and B-grade sourcing as the main proposition. [Metadata](../src/app/layout.tsx), [taxonomy](../src/lib/taxonomy.ts) and [seed data](../prisma/seed.ts) still include footwear, although footwear is excluded from the business scope. |
| Shared carts and stock reservation       | Implemented     | [Cart service](../src/server/carts/service.ts) implements creation, joining, one active cart per buyer, stock reservation/release, merges, configurable minimums, acceptance and deadline handling. [Cart rules](../src/lib/cart-rules.ts) define the states and eligibility checks.                                                                                                                        |
| Cart discovery, sharing and owner chat   | Implemented     | [Cart queries](../src/server/carts/queries.ts) support open-cart discovery and distance ordering. The [buyer dashboard](../src/app/dashboard/page.tsx) provides link copying. [Chat service](../src/server/carts/chat.ts) supports private conversations with the owner. Legacy invite data/services remain; that does not mean the removed cart-page invite form is active.                                |
| Owner bank-transfer payment              | Implemented     | [Slip service](../src/server/carts/slips.ts) supports owner uploads and admin approval/rejection. Approval converts reservations into sold stock. Bank reconciliation is manual; members' payments to the owner are outside the platform.                                                                                                                                                                   |
| Bulk lot pricing and stock monitoring    | Implemented     | [Lot service](../src/server/lots.ts), [pricing rules](../src/lib/stock-rules.ts) and [stock dashboard queries](../src/server/stock.ts) track allocated lot costs, scheduled markups, stock age, movement and cost recovery. They do not establish net profit after every operating expense.                                                                                                                 |
| Factory offers and receiving             | Implemented     | [Offer service](../src/server/offers.ts) handles review and decisions; [receiving service](../src/server/receiving.ts) records who received accepted stock. Receiving an offer is separate from listing products and entering variant stock. Supplier payment tracking is outside the current scope.                                                                                                        |
| Factory test-to-bulk design insight      | Implemented     | [Design service](../src/server/designs.ts) links accepted offers to products and reports demand, purchases, sizes, price history and test/bulk periods. “Wanted” derives from retained cart lines, including unpaid or expired carts; it is not a record of all historical interest or a guarantee of future sales.                                                                                         |
| Factory-direct fulfilment                | Implemented     | Since 2026-11-03 (`DEC-010`): [fulfilment mode](../src/lib/fulfilment.ts) defaults to FACTORY. [Cart service](../src/server/carts/service.ts) keeps each cart to one factory; [factory orders](../src/server/factory-orders.ts) and the [factory Orders page](../src/app/seller/orders/page.tsx) let the factory mark orders packed; [booking](../src/server/delivery/index.ts) needs that mark and sends the factory as the PickMe pickup. The lot price drop is off. |
| Two-person packing and handover          | Parked          | [Packing service](../src/server/packing.ts) and [packing rules](../src/lib/packing-rules.ts) are kept but only run with `FULFILMENT_MODE=WAREHOUSE`; `/packing` shows a paused state and new packer accounts are blocked. |
| Manual delivery operations               | Implemented     | [Delivery service](../src/server/delivery/index.ts) and [manual provider](../src/server/delivery/provider.ts) record bookings entered by the admin, failed-trip rebooking and delivery completion. Booking the real trip remains an external operational task.                                                                                                                                              |
| PickMe API integration                   | Partial         | [Provider](../src/server/delivery/provider.ts) and [webhook](../src/app/api/webhooks/pickme/route.ts) explicitly use assumed request, response or callback formats. They need actual provider documentation, credentials, mapping and end-to-end verification before relying on automated bookings.                                                                                                         |
| Notifications                            | Implemented     | [Notification service](../src/server/notify/index.ts) writes in-app notices. Email, SMS and WhatsApp notification delivery are not implemented.                                                                                                                                                                                                                                                             |
| Refunds, exchanges and after-sales cases | Not implemented | The [schema](../prisma/schema.prisma) and [payment service](../src/server/carts/slips.ts) contain no refund, exchange or complaint workflow. This records current scope; stock reservation does not resolve fit, damage or payment exceptions. The business response to those cases remains in [decisions](decisions.md).                                                                                   |

## Premium brands and planned experiences

Updated **2026-10-26**: [Brand communications](../src/server/brand-communications.ts) and [versioned reviews](../src/server/brand-reviews.ts) connect dashboards through product, paid-gift, settlement and general conversations. Shared replies, internal admin notes, per-user read/seen state, unread/needs-reply filters and resolution are implemented. Approved products may propose new terms without changing live prices until approval or rewriting existing gift charges. Brands acknowledge paid instructions and inspect/query/confirm itemized payments; admins record query resolutions. Events are transactional and notices deduplicated/retryable. Delivery fee fields, bank automation and courier integration remain excluded.

Premium flows inspected and updated on **2026-10-25**. Brands hold and directly ship gifts; customers pay separate gift delivery. Manual eligibility approval is available while household/threshold rules remain open.

Updated **2026-10-26**: new/revised gift submissions support required photo upload/preview, contents, size/weight/volume and dispatch business days, optional description and applicable expiry/shelf-life fields. Details persist in `StockOffer` and appear in brand products, admin review and the assigned recipient's basket. Private photo access uses `brand-photos.ts`; delivery-charge fields remain excluded. Older records retain nullable metadata.

| Capability                              | Status          | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand dashboard and product submissions | Implemented     | [Brand dashboard](../src/app/seller/brand-dashboard.tsx) provides Overview, Gift orders, Gift products, Settlements and Messages. [Brand service](../src/server/brands.ts) accepts retail/partner prices and campaign quantities; all product changes use versioned submissions and explicit approval. Brands can pause products and adjust quantities above existing allocations.                                                   |
| Gift-only distribution                  | Implemented     | [Catalogue](../src/server/catalogue.ts) excludes brand-linked products from public listings, suggestions, facets and direct product lookup; [cart service](../src/server/carts/service.ts) rejects paid additions. [Design linking](../src/server/designs.ts), the admin offer page and [receiving](../src/server/receiving.ts) exclude brand stock from ordinary factory flows. Historical products remain stored.                  |
| Basket gift reservations                | Implemented     | [Gift service](../src/server/gifts.ts) locks the basket and offer to prevent duplicate recipient allocations and overselling. Admins manually confirm eligibility at [Brand rewards](../src/app/admin/brands/page.tsx). Unpaid gifts reduce availability but expose no recipient details to brands. Removal, leaving, expiry/cancellation and reduced clothing quantities release reservations; merges move them with the recipient. |
| Paid brand fulfilment                   | Implemented     | [Slip approval](../src/server/carts/slips.ts) activates reserved gifts atomically with clothing payment approval. Brands record courier/tracking, delivered or issue status for their own paid gifts; recipients receive in-app notices. This records external courier operations, with no courier API or gift delivery fee collection.                                                                                              |
| Sunday gift bill reconciliation         | Implemented     | Admins explicitly approve bills and record externally completed transfers against selected gift IDs and a bank reference. Brand statements show approved unpaid charges, pending review, issues and payment history. Snapshotted prices and row locks prevent duplicate settlement. No automated bank payments or unapproved weekly cutoff/billing trigger.                                                                          |
| Family and automatic gift eligibility   | Not implemented | No household model, automated spending threshold, tier engine or buyer gift-selection workflow. Manual assignment supports operations but does not resolve DEC-002/DEC-003 or overlapping household awards.                                                                                                                                                                                                                          |
| Body-measurement personalization        | Not implemented | No buyer/garment measurement model in the main app. The standalone [fit lab](../fit-lab/README.md) remains an uncalibrated experiment.                                                                                                                                                                                                                                                                                               |

## Development verification tooling

Updated **2026-10-27**: `.agents/skills/` contains four project review skills and selected pinned
Prisma, Vercel and Playwright skills. `npm run check` adds monetary structural checks, tooling
safety tests and deterministic property tests. Integration/browser entry points guard the
disposable loopback `groupbasket_test` database. Browser smoke coverage checks accessibility
and overflow on desktop and at 360 px, alongside the existing desktop purchasing journeys.
GitHub quality/security workflows and Dependabot configuration are committed setup, not proof
of successful hosted execution or required branch protection. See [development tooling](development-tooling.md)
for commands, upstream revisions, coverage limits and external account dependencies.

Local Next.js DevTools and Context7 process handshakes passed. The restricted development
reader was provisioned without changing application rows; MCP verification passed read-only
identity, sanitized-stock-view access and denial of direct user-table access. These checks do
not mount tools into an already-running assistant session. Local credentials remain ignored.
Production deployment is unaffected. GitHub reports that branch protection on this private
repository requires an account upgrade; no visibility or subscription changes were made.

Follow-up on **2026-10-27**: Next.js DevTools and PostgreSQL are now exposed in the current
assistant session and were exercised successfully: the app was discovered on 3002 without
configuration/session errors; the reader reported read-only transactions and denied direct
user-table access. Context7 now uses its verified official hosted endpoint, with a successful
public-library lookup and clean shutdown, replacing the failing local Windows process. Its
configuration is enabled for the next client refresh. GitHub/Figma plugin account authorization
and the private-repository branch-protection entitlement remain external dependencies.
The follow-up passed `npm run check` (89 unit and seven tooling tests), the hosted Context7
lookup/shutdown check, lockfile dry-run and an npm audit with zero vulnerabilities.
Its first hosted browser run exposed a stale global join-cart toast intercepting the next
confirmation link. Global flash feedback now clears when another form submission starts;
the buyer journey verifies removal of the stale message before a normal View cart click.
The fix passed `npm run check`, a production rebuild and both buyer journeys repeated three
times (six browser passes) against the isolated production test server.

Local verification on **2026-10-27**: production builds passed; typecheck, lint, monetary and
documentation-link checks passed; 89 unit tests, seven tooling safety tests and 72 integration
tests passed. All nine browser scenarios were verified against the production server, with the
two buyer journeys rerun after correcting the stale active-cart navigation assertion. Both
Semgrep rule fixtures passed and the application scan reported no findings. `npm audit`
reported zero vulnerabilities. Hosted CI results must be checked on GitHub separately.

## Deployment dependencies

Hosting remains undecided in the project brief. Uploads use [local storage](../src/server/storage/local.ts); a deployment needs durable storage, or a replacement adapter if its filesystem is ephemeral. The repository does not establish that a production database, storage, bank details or scheduled jobs have been configured.

The [sweep endpoint](../src/app/api/cron/sweep/route.ts) exists, and page loads also trigger deadline work. An actual deployment still needs its schedule and secret configured. Follow the [README](../README.md) for setup, and the [architecture reference](architecture.md) for implementation details.

No real premium-brand partnership, negotiated discount or campaign approval is verified by these source files. Illustrative brands and figures in the business brief must not be presented as operational agreements.


## Group design samples (2026-10-27)

`SAMPLE-001` is recorded in the operating brief. [Sample service](../src/server/samples.ts)
and [buyer samples](../src/app/samples/page.tsx) support group-owner requests before
purchase, duplicate-active-request rejection, group-member history, destination snapshots
and explicit transport-quote acceptance. [Warehouse](../src/app/admin/warehouse/page.tsx)
records quotes, declines, dispatch tracking and delivery. There is no sample sending fee;
the group pays transport externally. Samples remain separate from paid clothing checkout,
factory test-piece purchases and brand gifts. Return/ownership/exception rules remain open
under `DEC-009`. Verification results are reported with the change; source availability
alone does not prove a test pass or deployed database migration.

## Three operational admin workspaces (2026-10-27)

Stored `User.adminArea` separates premium brands (`/admin/brands`), factory apparel
(`/admin/factory`), and warehouse/payment/sample/delivery operations (`/admin/warehouse`).
There is no unrestricted admin: migration `remove_unrestricted_admin` removes `ALL` and
turns former unrestricted accounts into warehouse admins. Each area holds its stream's
former main-admin capabilities: FACTORY the Stock dashboard and stock/margin settings,
WAREHOUSE cart/payment/bank settings and the orders CSV, and each area its own
stakeholder accounts (list, open, lock, create) and its own admins. `npm run admin:create`
creates a deployment's first admins; the seed creates one admin per area.
Shared guards restrict pages/actions/private files; actor-aware brand, sample, slip and
cancellation services verify stored permissions. Factory offers and warehouse receipt
share existing records; factory sample demand is aggregate-only. Stakeholder accounts
retain their existing ownership restrictions. Migrations are included; deployment requires
applying them to the intended database. Local development migrations were applied to verified `localhost:5546/groupbasket`
without seeding or resetting; production migration/deployment remains separate.

Verification for this change on **2026-10-27**: `npm run check` passed (91 unit tests,
seven tooling tests, typecheck, lint, monetary structural and local documentation links);
`npm run test:int` passed all 81 tests in 18 files; `npm run e2e` passed all 11 desktop/mobile
scenarios, including scoped admin provisioning/access denial and sample request through
delivery. Mobile admin screenshots were visually reviewed. Sample duplicate-request,
stale-quote, quote-acceptance and merge-history cases are covered. Next.js DevTools compiled
the running development warehouse route without issues. No production deployment or
external courier/bank operation was performed.
