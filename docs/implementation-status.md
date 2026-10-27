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
| Two-person packing and handover          | Implemented     | [Packing service](../src/server/packing.ts) and [packing rules](../src/lib/packing-rules.ts) require different gatherer and packer accounts, record both steps, and allow handover only after packing and delivery booking.                                                                                                                                                                                 |
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
