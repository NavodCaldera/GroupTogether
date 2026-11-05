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
| Factory-direct fulfilment                | Implemented     | Since 2026-11-03 (`DEC-010`): [fulfilment mode](../src/lib/fulfilment.ts) defaults to FACTORY. [Cart service](../src/server/carts/service.ts) keeps each cart to one factory; [factory orders](../src/server/factory-orders.ts) and the [factory Orders page](../src/app/seller/%28workspace%29/orders/page.tsx) let the factory mark orders packed; [booking](../src/server/delivery/index.ts) needs that mark and sends the factory as the PickMe pickup. The lot price drop is off. |
| Four admins and factory self-service     | Implemented     | `DEC-011`: [admin areas](../src/lib/admin-access.ts) add CORE (settings and admins only). Factories with current checks/agreement eligibility (`FAC-002`) publish through [`saveProduct`](../src/server/catalogue.ts) with `sellerId` (LIVE, no listing review), see the [sales dashboard](../src/server/factory-dashboard.ts) on `/seller`, and admins hide listings (`ARCHIVED`). [Ratings](../src/server/ratings.ts) are given on delivered carts and shown in the shop and on product pages. |
| Factory staff and roles                  | Implemented     | Phase 1 of `DEC-012`: [roles](../src/lib/factory-roles.ts) (Owner, Packing, Planner, Sales; only owners see money), [team service](../src/server/factory-team.ts) and `/seller/team` (add, change job, lock; adding staff requires selling eligibility). `requireFactory(section)` in the [session guard](../src/server/auth/session.ts) gives each job its own sections and bottom tabs. Checklists, payouts, drafts, inbox and chat are not built yet. |
| Factory dashboard (phone first)          | Implemented     | `/seller` (alerts, orders to pack, this month's paid figures), `/seller/orders` (stage counts, Mark packed), `/seller/products` (paid sales, wanted in active carts, inline stock) and `/seller/insights` (rating from 5 ratings, restock, pack time, demand, price bands, cities from 5 orders). [Rules](../src/lib/factory-insights.ts) and [queries](../src/server/factory-dashboard.ts). |
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

## Production hardening (2026-11-05)

- **Implemented:** security headers in [Next config](../next.config.ts): production-only HSTS, frame denial, nosniff, strict-origin referrers and CSP for existing map/search/error-reporting origins. Development permits eval and WebSockets; production upgrades insecure requests. The site CSP excludes slip and partner-document paths so their stricter sandbox CSP survives; other headers remain global. The owner-authorized browser-only Zod `jitless` initialization in [location schemas](../src/lib/location.ts) prevents eval capability probes before schema construction. All three [security header browser tests](../tests/e2e/security-headers.spec.ts) pass against the production build, including zero violations across the tested pages and resources. Production `unsafe-eval` remains prohibited.

- **Implemented:** per-email password login rate limiting (AUTH-001) in [auth service](../src/server/auth/service.ts), with private LoginAttempt persistence and migration login_attempts. Five failures lock for ten minutes; unknown emails follow the same rules, active locks skip password checks without extending, expiry resets, and successful sign-in deletes the counter. Password verification holds no transaction or pooled connection; parameterised atomic writes reset expired counters and preserve active deadlines. In-flight attempts past the initial check may finish after the fifth failure, an accepted burst trade-off. Covered by [login lockout integration tests](../tests/integration/login-lockout.int.test.ts).

- **Implemented:** app-wide error boundaries (`src/app/error.tsx`, `src/app/global-error.tsx`) with retry; covered by `tests/e2e/error-boundary.spec.ts`. The root-layout fallback has no automated test.
- **Partial:** Sentry error reporting is configured and scrubbed but inactive until a DSN is set; no event has been sent to a real Sentry project yet. The Sentry MCP needs `SENTRY_ORG`/`SENTRY_PROJECT` and Claude Code approval on restart.

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

## Factory partnership Part 1 (2026-11-05)

Task 1.1 provides the joining models and legacy profile backfill in `prisma/schema.prisma` and migration `factory_partnership_joining`. Demo seeding includes agreement v1 and the factory profile. Task 1.2 implements public/invite applications, FACTORY/CORE admin review and visits, private document access, identity reapply checks and bank-name approval checks in `src/server/partners.ts`. Approval adds the owner/profile and an in-app notice linking to `/sign-in`. New owners receive a separate hashed seven-day `FactoryActivation`; the raw link is returned only in the authorized admin action response, never stored in notifications or sessions. No email/SMS delivery exists. Task 1.3 adds CORE publication, owner acceptance/renewal, current-version/expiry checks, the seller workspace layout gate and listing/staff/cart-add/unpaid-checkout/public-query enforcement. Legacy owners need approved checks as well as current acceptance once their 30-day grace ends. Full sweeps deliver one deterministic reminder per term and retry missing deliveries. Paid-cart states and monetary snapshots are preserved. Approval and replacement links are displayed once for manual delivery; refresh clears the display. FACTORY/CORE admins can replace unused activations for owners created through approval only before any activation is redeemed. Replacement sets `revokedAt`; only redemption sets `usedAt`. Any non-null `usedAt` blocks reissue under the owner lock and hides the admin action; redemption requires both markers to be null. The column-only migration leaves ambiguous historical `usedAt` values unchanged and conservatively blocked. Authenticated legacy applicants get no activation and keep their password. Redemption atomically consumes the activation and sets the password before the action creates a normal session. Migration cleanup revokes old approval sessions by matching notification-token hashes and removes raw tokens from notification links. Parts 2-4 remain outside this change.


Part 1 review fixes: `tests/e2e/admin-workspaces.spec.ts` includes Applications in the exact factory-admin tab order, with the existing badge-aware assertions preserved. Public catalogue list/suggest/facet/savings/detail queries independently preserve `IN_SHOP.AND` brand exclusion when adding factory eligibility; `tests/integration/catalogue-eligibility.int.test.ts` exercises a deliberately broadened eligibility predicate and preserves sold-out ordinary detail links.

Activation reissue follow-up verification (2026-11-05): both new regressions failed before implementation, then all 17 activation tests passed. `npm run check` passed 117 unit tests, eight tooling tests and structural/doc/type/lint checks; `npm run test:int` passed all 127 tests in 24 files. The normal and production e2e builds passed, and `CI=1 npx playwright test tests/e2e/partners.spec.ts` passed the 360px journey including hidden reissue controls after redemption. Migration status reports 31 migrations up to date. Development had zero activation rows before the nullable-column-only migration; no data markers were rewritten. The restricted reader remains denied access to `FactoryActivation`, including `revokedAt`.

Review-fix verification (2026-11-05): `npm run check` passed (117 unit tests, eight tooling tests and monetary/doc/type/lint checks); `npm run test:int` passed 126 tests in 24 files; both `npm run build` and the `GROUPBASKET_E2E=1 npx next build` production browser build passed. `CI=1 npm run e2e` passed all 19 desktop/mobile tests, including the corrected admin tab order, one-time activation display/replacement and zero CSP violations. The 360px activation screen was visually reviewed. `npx prisma migrate status` reported 30 migrations up to date. The local development cleanup changed zero sessions/notifications and backfilled zero activations; synthetic migration regression coverage verified exact-session revocation, ordinary-session preservation, legacy-password preservation and token-free notices. The restricted reader was refused direct `FactoryActivation` access.

Part 1 verification on 2026-11-05: `npm run check` passed (110 unit tests, eight tooling tests, monetary/doc/type/lint checks); `npm run test:int` passed all 109 tests in 22 files; `npm run build` passed. The full joining/approval/first-sign-in/acceptance/new-version/re-acceptance journey passed at 360px, and `npm run e2e:mobile` passed both accessibility/workspace smoke scenarios. Final admin and agreement screenshots were visually reviewed. Cross-role document denial tests passed, and the restricted development reader was refused access to each of the six new tables. Added regressions cover stale displayed agreement versions, repeat-safe reminder recovery, Colombo leap-day anniversaries, Sinhala bank-name marks and unpaid checkout after expiry, while preserving paid-cart snapshots. Verification used synthetic, isolated test data; no deployment or external message delivery was performed.

## Factory partnership Part 2: commission and tokens

**Implemented (Tasks 2.1?2.3):** `Settings.commissionPerPiece` is CORE-only, default LKR 100, and new direct factory listings persist `Product.factoryPrice` and a commission snapshot. `Product.price` remains the buyer price, while existing-listing edits reuse the stored snapshot and lot/own/premium paths retain their pricing. The seller form shows a Decimal-based live buyer-price preview. Migration `factory_commission` preserves existing buyer prices; the mandatory development count below LKR 100 was zero. Tests: `src/lib/price-rules.test.ts`, `tests/integration/commission.int.test.ts`. The append-only token ledger and transactional credit/apply/release/spend helpers now exist, with stable event keys, line revisions and user-first cart locks. Tests cover replay and concurrent cross-cart spending. Cart removal, excess quantity reduction, leaving, expiry and pre-payment cancellation release holds; rejected slips retain them and approval appends a zero-delta SPEND. Merges preserve line IDs and holds. Minimums use gross value; the pay page, recorded slip and dashboard use `amountDue`. Members apply tokens only to their own lines, and customer accounts show their own balance and paginated ledger history. Regression evidence: `tests/integration/carts.int.test.ts`, `src/lib/cart-money.property.test.ts` and the 360px `tests/e2e/commission-tokens.spec.ts`. Parts 3?4 remain unimplemented.

Part 2 verification (2026-11-05): `npm run check` passes (122 unit/property tests and 8 tooling tests); `npm run test:int` passes (147 tests, 26 files); production and E2E builds pass; migration status is current (33 migrations). The full production browser suite passes 20 tests, including 360px token/commission and accessibility coverage. The read-only inspector was refused access to the new TokenEntry table.

Zero-due owner confirmation (DEC-013, 2026-11-05): `acceptAndPay` now confirms fully
token-covered carts atomically through shared `confirmPaidCart`; gifts, stock, tokens and
post-commit notices match slip approval. Positive transfer amounts retain the slip flow. The
acceptance action opens the confirmed cart, and direct pay links use the existing redirect.

Zero-due verification (2026-11-05): the new confirmation/race tests failed before implementation.
`npm run check` passed (122 unit/property and 8 tooling tests); `npm run test:int` passed
151 tests across 26 files, including unchanged slip regressions and new zero-due gift/factory
notice coverage. Production and E2E builds passed. The full `CI=1 npm run e2e` suite passed
21 tests; the zero-due confirmed cart and direct pay-link redirect passed at 360px, and the
confirmed screen was visually reviewed.

## Cart member done before finish (CART-006)

Implemented on 2026-11-05, independently of factory partnership Parts 3-4. Migration
`cart_member_done` adds nullable `CartMember.doneAt`; existing rows remain null. Acceptance
checks all non-owner members with lines under the cart lock. Self-only Done/Undo and owner-only
removal require editable, unexpired carts. Removal uses normal stock/token/gift release and
recomputes readiness. Empty members do not block, and removed members can rejoin. Share changes
reset Done in the same transaction, including lines, actual token holds/releases and gift
reservation changes. Merge arrivals start not done. Owner notices fire once per all-done
transition. Cart controls show Done/Undo, member status, confirmed removal and completion count.
Regression coverage: carts/gifts integration tests and updated journey/commission-token browser
specs, including 360px ownership controls.

CART-006 verification (2026-11-05): the new guard/member-operation tests failed first.
`npm run check` passed (122 unit/property tests, 8 tooling tests and monetary/doc/type/lint
checks); `npm run test:int` passed 165 tests across 26 files. The production build passed;
`npx prisma migrate status` reported 34 migrations up to date. The E2E production build and
full `CI=1 npm run e2e` suite passed all 22 tests, including the updated checkout and 360px
Done/Undo/Remove journey, keyboard activation, completion count, disabled acceptance and axe
checks. Phone screenshots were visually reviewed. The added gift cancellation/merge race guard
prevents resetting Done on a cart whose lock was not acquired. No partnership Part 3 work was
included.
