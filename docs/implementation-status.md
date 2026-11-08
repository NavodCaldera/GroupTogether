# Implementation status

Updated **2026-11-08 (area agent model)**: buyers pay upfront and collect from area agents, as
approved in [spec 003](../specs/003-area-agent-model/spec.md). Tasks 1–17 built the new flow and
Task 18 (08ecdc6) removed the group-cart system (group carts, members, merges, invites,
discovery, bank slips, the warehouse and packing staff, lots, price changes, samples, factory
stock offers, designs, owner chat, the PickMe provider and webhook, the cart-keyed factory
ratings, and the bank, margin and store-size fields in Settings). Verification results for each
task are recorded in the [changelog](CHANGES.md) and in the task reports, not here. Sections
dated before 2026-11-08 below are history: they describe cart-era code, much of which no longer
exists. Code pointers in them are plain text where the file was removed.

The [main agent brief](../.claude/agents/groupbasket.md) owns business policy. This file records what the code supports. Unresolved policy belongs in [business decisions](decisions.md). Update the affected row whenever implementation changes; an implemented feature does not override an approved business rule.

## Status meanings

- **Implemented:** the described code path and supporting data structures exist.
- **Partial:** part of the capability exists; the remaining work is named.
- **Not implemented:** the inspected application has no supporting workflow or data model.
- **Parked:** hidden from users by owner decision; data is kept and the code may remain.
- **Paused:** an unfinished policy the owner stopped; it must not be built.
- **Removed:** deleted with the group-cart system; its rule IDs are retired.
- **Policy mismatch:** existing behavior differs from the documented business direction.

## Area agent model

| Capability                          | Status          | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money rules                         | Implemented     | [agent-money](../src/lib/agent-money.ts) computes totals, the PayHere fee (1,000 + 40 + 20 at 0.033 → 36.17, total 1,096.17), the multi-factory checkout split, and cancel, return and missing-item refunds, with unit and property tests. `ORD-*`, `PAY-004`.                                                                                                                                                  |
| Personal cart and checkout          | Implemented     | [checkout](../src/server/orders/checkout.ts) and [cart](../src/server/orders/cart.ts): personal cart with no stock held; nearest live agent pre-selected (or `?agent=`), any live agent selectable, hours shown; one `PaymentAttempt` per checkout; token-only checkouts skip the gateway. No schema field stores a default agent. `ORD-001`–`ORD-003`.                                                         |
| Gateway and verified notices        | Implemented     | [gateway](../src/server/payments/gateway.ts), [demo gateway](../src/server/payments/demo.ts) and [notice handler](../src/server/payments/notice.ts): signed notice verified on the raw body, amount and currency checked, duplicates ignored, late or mismatched payments credited as `LATE_PAYMENT` tokens. Demo only (`PAYMENT_GATEWAY=demo`); PayHere waits for written approval (`DEC-016`). `PAY-005`, `PAY-006`. |
| Baskets, locking and cancellation   | Implemented     | [baskets](../src/server/orders/baskets.ts): one open basket per agent and factory (partial unique index), lock at `basketLockAmount` on goods only, maximum-wait lock in the sweep, early lock on suspension or leaving, cancel before lock with full `ORDER_CANCEL` tokens, expiry of unpaid holds. Cancelled orders keep `basketId`, so queries filter by status. `BSK-001`–`BSK-003`, `ORD-004`.            |
| Factory packing and missing items   | Implemented     | [delivery service](../src/server/orders/delivery.ts): Packing or Owner marks Packed; Report missing per line; Factory admin removes the line (buyer `MISSING_ITEM` tokens, payout deduction) or dismisses the report. Removing a missing line leaves `Order.itemsTotal` and variant `sold` unchanged, so payouts rely on line earnings and missing quantity. `BSK-004`, `BSK-007`.                               |
| Courier booking and receipt         | Partial         | Admin books packed baskets by hand with fee and driver details; Packing records Given to driver; the agent marks received and is repaid exactly the booked fee as `COURIER_REPAY` tokens, and buyers get their pickup code. **Parcel is back after a failed trip is not built** (`CourierBooking.failedAt` exists, nothing sets it), so a failed trip cannot be rebooked. No courier API. `BSK-005`, `BSK-006`. |
| Pickup codes and handover           | Implemented     | [handover](../src/server/orders/handover.ts): one 6-digit code per buyer and agent; lookups are serialized per agent and five failures in ten minutes block the agent. A correct code with nothing left to collect counts as a failure. `handOver` itself is not throttled. Waiting for pickup has no time limit. `ORD-005`.                                                                                   |
| Returns through agents              | Implemented     | [returns](../src/server/returns.ts): filed within `collectHours` of receipt on collected lines; factory decides in 24 hours, then Factory admin; buyer told which agent; 7-day handover then lapse; tokens credited at agent collection (no condition check, `DEC-016`); factory-fault courier charge deducted; item returns with the next courier and the factory marks it received. `RETURN-001`.             |
| Agents | Implemented | [agent services](../src/server/agents/live.ts) and `/agent`, `/agents/apply`, `/admin/agents`: application with private photos and pin, 2 km clash blocks approval, weekly hours set by an approved applicant before the deposit (a 23:59 close is stored as 24:00), deposit plus PayHere fee by gateway, suspension and lift, leaving with losses and `DEPOSIT_RETURN` tokens, admin collection of returns stranded at a leaving agent. `AGT-*`. |
| Tokens and transfers                | Implemented     | [token ledger](../src/server/tokens.ts): append-only typed entries with unique event keys, no negative balances, transfers between token holders, refused for factory users. Core admin sees a user's history and totals by type. `TOK-*`.                                                                                                                                                                  |
| Weekly payouts and agent fees       | Implemented     | [payouts](../src/server/payouts/index.ts): weekly build after Saturday 23:59 Asia/Colombo of lines payable `collectHours` after receipt with no open return or pending missing report, deductions listed, agent fees credited once per agent and week; Core admin marks paid with a bank reference on `/admin/core/payouts`. If one factory's build fails, the week marker still advances. `PAY-007`, `AGT-005`. |
| Scheduled sweep | Implemented | [runSweep](../src/server/sweep.ts) behind the bearer-secret [cron route](../src/app/api/cron/sweep/route.ts) is the only sweep: order expiry, maximum-wait locks, return escalation and lapse, closing leaving agents, weekly payouts and agent fees, fault-hold retries (`faultHolds`), agreement reminders (`agreements`) and notice retries. Page loads never run it, so production must schedule the cron (`DEC-016`). |
| Role screens                        | Implemented     | Buyer `/` (Ready to collect first), agent `/agent` (Hand over first, sections as an in-page tab row), factory `/seller` by job, admin Agents and orders, Factory and Core homes. Open layout questions are in `DEC-016`. `UX-002`.                                                                                                                                                                          |
| Factory jobs                        | Implemented     | [roles](../src/lib/factory-roles.ts): Owner, Sales and Packing only; Planner staff became Sales and packing staff became buyers. Sales sees basket totals; the Owner has no Baskets tab (`DEC-016`). `FAC-001`.                                                                                                                                                                                           |
| Admin areas                         | Implemented     | [admin areas](../src/lib/admin-access.ts): `AGENTS` (renamed from `WAREHOUSE`), `FACTORY`, `CORE`, `PREMIUM`. `ADMIN-002`.                                                                                                                                                                                                                                                                                  |
| Demo seed                           | Implemented     | Two factories with Owner, Sales and Packing, three live agents and one applicant, six buyers, baskets in every state, a ready pickup code, a return awaiting handover and one admin per area; logins in [demo accounts](../src/lib/demo-accounts.ts).                                                                                                                                                     |
| Premium brands and gifts | Parked | Brand, `StockOffer` submission, review, conversation and settlement data are kept. Gift reservation was cart-based and is gone, so no new gift order can be made; existing gift orders lost their cart link and still show on the brand overview. The Gift orders and Settlements tabs are hidden in `/admin/brands` and the brand dashboard; the code and data stay. `BRAND-*`, `GIFT-*`, `DEC-001`–`DEC-004`. |
| Design tests and likes              | Parked          | Approved 2026-11-07, never built, then parked by spec 003 (FR-034); the cart-era design insight pages were removed in Task 18. Not deleted from the plan. `SUP-003`.                                                                                                                                                                                                                                                                                                   |
| Factory preorders                   | Paused          | **Not completed.** Paused by the owner on 2026-11-07 with no approved policy or code. Resume only from [DEC-015](decisions.md) and Question 25.                                                                                                                                                                                                                                                              |
| Group carts, slips, warehouse, lots | Removed | Group carts, members, merges, invites, discovery, owner chat, bank slips and review, the warehouse and Stock page, packing staff, lots, price changes, samples, factory stock offers and designs, the PickMe provider and webhook, the cart-keyed `FactoryRating` table, and the Settings bank, margin and `storeCapacity` fields (FR-033). `TokenKind.CANCELLATION` rows became `ORDER_CANCEL`; every return now belongs to an order line. |

## Commerce and operations

| Capability                            | Status          | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clothing catalogue and business scope | Implemented     | Clothing-first [home page](../src/app/page.tsx), [metadata and footer](../src/app/layout.tsx). [Taxonomy](../src/lib/taxonomy.ts), [seed data](../prisma/seed.ts) and test fixtures offer clothing only. The legacy `SHOES` enum and image placeholder are kept for stored rows. Factory surplus and B-grade clothing remain secondary under `CAT-002`.                                                                     |
| Factory self-service listings | Implemented | Factories with current checks/agreement eligibility (`FAC-002`) publish through [`saveProduct`](../src/server/catalogue.ts) with `sellerId` and see the [sales dashboard](../src/server/factory-dashboard.ts) on `/seller`; admins hide listings. [Ratings](../src/server/ratings.ts) are given on collected order lines; a factory's score is the average of its product ratings. The Ratings page reads orders: pack time is basket lock to Given to driver, demand is pieces in buyers' carts, cities are agents' cities. `SUP-002`, `RATE-001`. |
| Notifications                         | Implemented     | [Notification service](../src/server/notify/index.ts) writes in-app notices after commit. Email, SMS and WhatsApp delivery are not implemented. `COM-001`.                                                                                                                                                                                                                                                                 |
| Quality and fault holds | Partial | Ratings, reports, flags, hides, factory removal and fault holds are implemented ([quality](../src/server/quality.ts), [fault holds](../src/server/fault-holds.ts)); since Task 18 they no longer clean carts. What a hide, hold or removal does to paid orders in baskets is open (`DEC-016`). |

## History before the area agent model

The dated notes below record cart-era work. They are not current capability claims.

Updated **2026-11-06 (returns rebuild)**: [fault holds](../src/server/fault-holds.ts) implement
accepted fault units, the 12-calendar-month limit, owner/admin notices, private threads,
Continue/Remove and fault cancellation. New factory deadlines are 24 hours; admins see returns
at filing. [Shared cleanup](../src/server/quality.ts) cancels only pre-booking carts; ordinary
hides preserve finished carts. DISPATCHED/DELIVERED are untouched. See FAULT-001 and the
[approved design](superpowers/specs/2026-11-06-returns-fault-limit-design.md).

Updated **2026-11-06 (Part 4)**: factory partnership Parts 1–4 are implemented. The
[returns service](../src/server/returns.ts) supports the inclusive 48-hour delivery window,
partial quantities, private photos, factory decisions, automatic admin review, final admin decisions,
removal handoff and once-only full-price tokens at receipt. Buyer controls live on delivered
carts, with `/seller/returns` for owner/SALES and `/admin/factory/returns` for decisions and
pickup operations. External PickMe return booking is **manual**; no provider call or second
cart Delivery is created. Buyer-fault used/untagged receipt handling is owner-approved under
DEC-013. Factory payouts remain outside scope.

Updated **2026-11-06 (return follow-ups)**: factory refusals and used/untagged buyer-fault
receipts go automatically to WITH_ADMIN, with a required reason and no tokens. A newly
recorded used receipt can reopen a prior acceptance for one final admin decision. Buyer
escalation was removed. Private ReturnMessage threads on admin detail and selected factory
items permit only FACTORY/CORE and own owner/SALES, posting only WITH_ADMIN, with
1000-character and ten-per-minute limits and one unread message notice per thread/recipient.
Buyer status gives no sending/pickup step until acceptance. Migration return_messages also
hands legacy appealable factory refusals to admins. See DEC-013 for approved policy.

Local Part 4 verification: `npm run check` passed (141 unit tests and eight tooling tests),
`npm run test:int` passed all 206 integration tests, both normal and E2E production builds
passed, and `CI=1 npm run e2e` passed all 25 browser tests. The Lanka Shirts journey passed
at 1280px and 360px with keyboard submission, zero Axe violations and no horizontal overflow;
the mobile screenshot was visually inspected. Prisma reports all 38 migrations applied.
The verified restricted development reader was denied SELECT on ReturnRequest, ReturnPhoto
and ReturnNotice. These are local verification results, not deployment evidence.

Updated **2026-11-06 (Part A)**: CART-006 completion notices also cover removal, leaving and
emptying the last waiting member. The shared transaction-local transition check suppresses
notices when no non-owner member has items. Regression coverage lives in `carts.int.test.ts`.

## Premium brands and planned experiences

**Parked since 2026-11-08 (FR-034):** the rows below describe the premium code as built for group carts. Gift reservation was cart-based and is gone; the Gift orders and Settlements tabs are hidden; brand data (including `StockOffer`) is kept. Read "Implemented" in this table as "built, now parked".

Updated **2026-10-26**: [Brand communications](../src/server/brand-communications.ts) and [versioned reviews](../src/server/brand-reviews.ts) connect dashboards through product, paid-gift, settlement and general conversations. Shared replies, internal admin notes, per-user read/seen state, unread/needs-reply filters and resolution are implemented. Approved products may propose new terms without changing live prices until approval or rewriting existing gift charges. Brands acknowledge paid instructions and inspect/query/confirm itemized payments; admins record query resolutions. Events are transactional and notices deduplicated/retryable. Delivery fee fields, bank automation and courier integration remain excluded.

Premium flows inspected and updated on **2026-10-25**. Brands hold and directly ship gifts; customers pay separate gift delivery. Manual eligibility approval is available while household/threshold rules remain open.

Updated **2026-10-26**: new/revised gift submissions support required photo upload/preview, contents, size/weight/volume and dispatch business days, optional description and applicable expiry/shelf-life fields. Details persist in `StockOffer` and appear in brand products, admin review and the assigned recipient's basket. Private photo access uses `brand-photos.ts`; delivery-charge fields remain excluded. Older records retain nullable metadata.

| Capability                              | Status          | Evidence and limits                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand dashboard and product submissions | Implemented     | [Brand dashboard](../src/app/seller/brand-dashboard.tsx) provides Overview, Gift orders, Gift products, Settlements and Messages. [Brand service](../src/server/brands.ts) accepts retail/partner prices and campaign quantities; all product changes use versioned submissions and explicit approval. Brands can pause products and adjust quantities above existing allocations.                                                   |
| Gift-only distribution                  | Implemented     | [Catalogue](../src/server/catalogue.ts) excludes brand-linked products from public listings, suggestions, facets and direct product lookup; cart service (`src/server/carts/service.ts`) rejects paid additions. Design linking (`src/server/designs.ts`), the admin offer page and receiving (`src/server/receiving.ts`) exclude brand stock from ordinary factory flows. Historical products remain stored.                  |
| Basket gift reservations                | Implemented     | [Gift service](../src/server/gifts.ts) locks the basket and offer to prevent duplicate recipient allocations and overselling. Admins manually confirm eligibility at [Brand rewards](../src/app/admin/brands/page.tsx). Unpaid gifts reduce availability but expose no recipient details to brands. Removal, leaving, expiry/cancellation and reduced clothing quantities release reservations; merges move them with the recipient. |
| Paid brand fulfilment                   | Implemented     | Slip approval (`src/server/carts/slips.ts`) activates reserved gifts atomically with clothing payment approval. Brands record courier/tracking, delivered or issue status for their own paid gifts; recipients receive in-app notices. This records external courier operations, with no courier API or gift delivery fee collection.                                                                                              |
| Sunday gift bill reconciliation         | Implemented     | Admins explicitly approve bills and record externally completed transfers against selected gift IDs and a bank reference. Brand statements show approved unpaid charges, pending review, issues and payment history. Snapshotted prices and row locks prevent duplicate settlement. No automated bank payments or unapproved weekly cutoff/billing trigger.                                                                          |
| Family and automatic gift eligibility   | Not implemented | No household model, automated spending threshold, tier engine or buyer gift-selection workflow. Manual assignment supports operations but does not resolve DEC-002/DEC-003 or overlapping household awards.                                                                                                                                                                                                                          |
| Body-measurement personalization        | Not implemented | No buyer/garment measurement model in the main app. The standalone [fit lab](../fit-lab/README.md) remains an uncalibrated experiment.                                                                                                                                                                                                                                                                                               |

## Development verification tooling

Updated **2026-11-08**: the read-only inspector's `cart_summary` view was dropped with the carts; `scripts/setup-ai-reader.mjs` now creates `order_summary`. The setup script refuses to run while the reader role exists, so an existing reader has no order view until it is set up again.

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

Hosting remains undecided in the project brief. Uploads use [local storage](../src/server/storage/local.ts); a deployment needs durable storage, or a replacement adapter if its filesystem is ephemeral. The repository does not establish that a production database, storage, payment gateway or scheduled jobs have been configured.

The [sweep endpoint](../src/app/api/cron/sweep/route.ts) runs `runSweep`; page loads no longer run any deadline work. A deployment must schedule it with `CRON_SECRET` (`DEC-016`). The PayHere switch needs PayHere's written approval (`DEC-016`). Follow the [README](../README.md) for setup, and the [architecture reference](architecture.md) for implementation details.

No real premium-brand partnership, negotiated discount or campaign approval is verified by these source files. Illustrative brands and figures in the business brief must not be presented as operational agreements.

## Group design samples (2026-10-27, removed)

`SAMPLE-001` is recorded in the operating brief. Sample service (`src/server/samples.ts`)
and buyer samples (`src/app/samples/page.tsx`) support group-owner requests before
purchase, duplicate-active-request rejection, group-member history, destination snapshots
and explicit transport-quote acceptance. Warehouse (`src/app/admin/warehouse/page.tsx`)
records quotes, declines, dispatch tracking and delivery. There is no sample sending fee;
the group pays transport externally. Samples remain separate from paid clothing checkout,
factory test-piece purchases and brand gifts. Return/ownership/exception rules remain open
under `DEC-009`. Verification results are reported with the change; source availability
alone does not prove a test pass or deployed database migration.

## Three operational admin workspaces (2026-10-27, history)

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

Task 1.1 provides the joining models and legacy profile backfill in `prisma/schema.prisma` and migration `factory_partnership_joining`. Demo seeding includes agreement v1 and the factory profile. Task 1.2 implements public/invite applications, FACTORY/CORE admin review and visits, private document access, identity reapply checks and bank-name approval checks in `src/server/partners.ts`. Approval adds the owner/profile and an in-app notice linking to `/sign-in`. New owners receive a separate hashed seven-day `FactoryActivation`; the raw link is returned only in the authorized admin action response, never stored in notifications or sessions. No email/SMS delivery exists. Task 1.3 adds CORE publication, owner acceptance/renewal, current-version/expiry checks, the seller workspace layout gate and listing/staff/cart-add/unpaid-checkout/public-query enforcement. Legacy owners need approved checks as well as current acceptance once their 30-day grace ends. Full sweeps deliver one deterministic reminder per term and retry missing deliveries. Paid-cart states and monetary snapshots are preserved. Approval and replacement links are displayed once for manual delivery; refresh clears the display. FACTORY/CORE admins can replace unused activations for owners created through approval only before any activation is redeemed. Replacement sets `revokedAt`; only redemption sets `usedAt`. Any non-null `usedAt` blocks reissue under the owner lock and hides the admin action; redemption requires both markers to be null. The column-only migration leaves ambiguous historical `usedAt` values unchanged and conservatively blocked. Authenticated legacy applicants get no activation and keep their password. Redemption atomically consumes the activation and sets the password before the action creates a normal session. Migration cleanup revokes old approval sessions by matching notification-token hashes and removes raw tokens from notification links. Parts 2–4 are recorded in the subsequent capability updates.

Part 1 review fixes: `tests/e2e/admin-workspaces.spec.ts` includes Applications in the exact factory-admin tab order, with the existing badge-aware assertions preserved. Public catalogue list/suggest/facet/savings/detail queries independently preserve `IN_SHOP.AND` brand exclusion when adding factory eligibility; `tests/integration/catalogue-eligibility.int.test.ts` exercises a deliberately broadened eligibility predicate and preserves sold-out ordinary detail links.

Activation reissue follow-up verification (2026-11-05): both new regressions failed before implementation, then all 17 activation tests passed. `npm run check` passed 117 unit tests, eight tooling tests and structural/doc/type/lint checks; `npm run test:int` passed all 127 tests in 24 files. The normal and production e2e builds passed, and `CI=1 npx playwright test tests/e2e/partners.spec.ts` passed the 360px journey including hidden reissue controls after redemption. Migration status reports 31 migrations up to date. Development had zero activation rows before the nullable-column-only migration; no data markers were rewritten. The restricted reader remains denied access to `FactoryActivation`, including `revokedAt`.

Review-fix verification (2026-11-05): `npm run check` passed (117 unit tests, eight tooling tests and monetary/doc/type/lint checks); `npm run test:int` passed 126 tests in 24 files; both `npm run build` and the `GROUPBASKET_E2E=1 npx next build` production browser build passed. `CI=1 npm run e2e` passed all 19 desktop/mobile tests, including the corrected admin tab order, one-time activation display/replacement and zero CSP violations. The 360px activation screen was visually reviewed. `npx prisma migrate status` reported 30 migrations up to date. The local development cleanup changed zero sessions/notifications and backfilled zero activations; synthetic migration regression coverage verified exact-session revocation, ordinary-session preservation, legacy-password preservation and token-free notices. The restricted reader was refused direct `FactoryActivation` access.

Part 1 verification on 2026-11-05: `npm run check` passed (110 unit tests, eight tooling tests, monetary/doc/type/lint checks); `npm run test:int` passed all 109 tests in 22 files; `npm run build` passed. The full joining/approval/first-sign-in/acceptance/new-version/re-acceptance journey passed at 360px, and `npm run e2e:mobile` passed both accessibility/workspace smoke scenarios. Final admin and agreement screenshots were visually reviewed. Cross-role document denial tests passed, and the restricted development reader was refused access to each of the six new tables. Added regressions cover stale displayed agreement versions, repeat-safe reminder recovery, Colombo leap-day anniversaries, Sinhala bank-name marks and unpaid checkout after expiry, while preserving paid-cart snapshots. Verification used synthetic, isolated test data; no deployment or external message delivery was performed.

## Factory partnership Part 2: commission and tokens

**Implemented (Tasks 2.1?2.3):** `Settings.commissionPerPiece` is CORE-only, default LKR 100, and new direct factory listings persist `Product.factoryPrice` and a commission snapshot. `Product.price` remains the buyer price, while existing-listing edits reuse the stored snapshot and lot/own/premium paths retain their pricing. The seller form shows a Decimal-based live buyer-price preview. Migration `factory_commission` preserves existing buyer prices; the mandatory development count below LKR 100 was zero. Tests: `src/lib/price-rules.test.ts`, `tests/integration/commission.int.test.ts`. The append-only token ledger and transactional credit/apply/release/spend helpers now exist, with stable event keys, line revisions and user-first cart locks. Tests cover replay and concurrent cross-cart spending. Cart removal, excess quantity reduction, leaving, expiry and pre-payment cancellation release holds; rejected slips retain them and approval appends a zero-delta SPEND. Merges preserve line IDs and holds. Minimums use gross value; the pay page, recorded slip and dashboard use `amountDue`. Members apply tokens only to their own lines, and customer accounts show their own balance and paginated ledger history. Regression evidence: `tests/integration/carts.int.test.ts`, `src/lib/cart-money.property.test.ts` and the 360px `tests/e2e/commission-tokens.spec.ts`. Parts 3–4 are implemented; see the later capability updates.

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

## Factory partnership Part 3: quality

**Implemented, Tasks 3.1-3.3:** line cancellation state, full-price idempotent token credits and cancellation
notice retry markers are implemented in `src/server/cancellations.ts`. Callers hold the cart/user
locks and flush notices after commit. Cancellation decrements sold without restocking hidden
items, leaves delivered lines untouched and cancels a cart only when no ACTIVE lines remain.
Stored payment totals stay unchanged; read projections and operational lists exclude cancelled
lines. The generic cancellation helper retains historical dispatched support, while hide/hold/removal
callers never touch booked/delivered carts. Product
ratings/reports are implemented with per-order/product uniqueness, delivered ACTIVE/RETURNED line ownership, low-star/report/photo validation, and a private `/api/report-photos/[id]` route. Product scores and factory scores combine new ratings with legacy history one-for-one. Factory-wide writes are retired. Manual-only flags and FACTORY/CORE hide/removal orchestration now exist in `src/server/quality.ts` and `/admin/factory/quality`. Metadata commits before separate locked cart cleanups. Unpaid removal reuses the normal release path and resets Done, with durable notices surviving deleted lines. Ordinary hides preserve all finished carts, including confirmation. Fault holds/removal cancel only pre-booking carts, releasing unpaid reservations or giving full-price paid tokens. Removal reuses session-ending account locks, fences listing/staff races, records earnings holds and sends no factory notices. Part 4 returns are implemented in the 2026-11-06 update above.

Part 3 verification (2026-11-05): tests were added before implementation, including cancellation,
receiver/report/photo access, quality flags, frozen confirmation and cleanup races. `npm run check`
passed 124 unit/property tests and 8 tooling tests plus monetary, documentation, type and lint
checks. `npm run test:int` passed 187 tests in 29 files. Production and E2E builds passed;
`npx prisma migrate status` reported all 37 migrations applied. The full `CI=1 npm run e2e`
suite passed 23 tests, including the 360px quality journey, private-photo refusals, Done reset,
factory staff sign-out and axe checks. Phone screenshots were visually reviewed. The restricted
reader was denied access to ProductRating, QualityReport, ReportPhoto and QualityNotice.
Conservation tests include finalized paid token usage alongside balances and unpaid holds,
because the existing zero-delta SPEND entry retains the original HOLD debit. Zero-price
cancellations mint no tokens. Part 4 returns are recorded in the 2026-11-06 update above; production deployment remains outside this work.
