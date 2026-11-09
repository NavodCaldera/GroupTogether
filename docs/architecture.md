# Architecture reference

This describes the source tree after the area agent model (2026-11-09). The [main agent brief](../.claude/agents/groupbasket.md) owns business policy; this document explains the implementation. [Implementation status](implementation-status.md) says what is and is not built.

## Application structure

- Next.js App Router, React, Tailwind, Prisma with PostgreSQL, zod, and decimal.js. Declared dependencies and scripts are in [package.json](../package.json); consult the lockfile or installed packages for resolved versions.
- Pages and route handlers: `src/app/`. Server actions validate requests and call services in `src/server/`. Database-independent domain rules live in `src/lib/`, with adjacent unit tests.
- Most pages render on the server. Small client components handle forms, countdowns, charts, map pins and toasts.
- PostgreSQL access is centralized in [db.ts](../src/server/db.ts). The Prisma client is generated into `src/generated/prisma`; edit the schema and migrations rather than generated files.
- Money is stored as `Decimal(14,2)` and calculated with `D` / `toD` from [decimal.ts](../src/lib/decimal.ts). Display and business-day helpers in [format.ts](../src/lib/format.ts) use Asia/Colombo.

Read the applicable installed Next.js guide under `node_modules/next/dist/docs/` before changing framework code, as required by [AGENTS.md](../AGENTS.md). Local setup and executable scripts belong in [README.md](../README.md) and [package.json](../package.json).

## Data model

The authoritative field definitions and constraints are in [schema.prisma](../prisma/schema.prisma).

| Domain | Tables and relationships |
| --- | --- |
| Identity | `User` has `CUSTOMER`, `SELLER`, `ADMIN` or `AGENT` role. Admins have one `adminArea` (`PREMIUM`, `FACTORY`, `AGENTS`, `CORE`). Factory staff link to their factory owner with a `FactoryRole` (`OWNER`, `PACKING`, `SALES`). `Session` stores a hash of the cookie token; `LoginAttempt` counts failed sign-ins. |
| Catalogue | `Product` has a factory price, commission and buyer price, one photo, taxonomy, a seller and hidden-state fields. `Variant` is unique by product, size and colour and holds `available`, `reserved` and `sold` counts. |
| Agents | `Agent` (one per AGENT user) stores status (`APPLIED` → `APPROVED` → `LIVE`, `SUSPENDED`, `LEAVING`, `LEFT`, `REJECTED`), pin and address, private document keys, deposit and losses. `AgentHours` holds one opening window per weekday; `AgentLoss` records admin-decided losses; `PickupAttempt` counts code entries. |
| Cart and orders | `CartItem` is a buyer's saved wish and holds no stock. Checkout makes one `Order` per factory for the chosen agent, with `OrderLine` price, courier and agent-fee snapshots. `Order.status` is `PENDING` → `PAID` → `RECEIVED`, or `CANCELLED`. |
| Baskets | `Basket` groups paid orders for one agent and one factory: `OPEN` → `LOCKED` → `PACKED` → `WITH_COURIER` → `AT_AGENT`. The partial unique index `Basket_one_open` allows one OPEN basket per agent and factory. `CourierBooking` stores the hand-booked driver, vehicle and fee. |
| Payments | `PaymentAttempt` (`ORDERS` or `DEPOSIT`) is one gateway charge; deposits also record `depositPrincipal`. `PaymentEvent` is the append-only record of verified notices, unique by `(gateway, eventId)`. `PickupCode` is one six-digit code per buyer and agent. |
| Tokens | `TokenEntry` is the immutable signed ledger (see Token ledger below). |
| Payouts | `FactoryPayout` is one row per factory and week ending; `PayoutItem` ties each order line to at most one payout; `PayoutDeduction` holds return-courier and missing-item deductions until a payout takes them. |
| Quality and returns | `ProductRating`, `QualityReport`, `ReportPhoto`, `ReturnRequest`, `ReturnPhoto`, `ReturnMessage`, `FactoryFault`, `FaultHold`, `FaultHoldMessage`, and the `QualityNotice` / `ReturnNotice` outboxes. |
| Factories | `FactoryApplication`, `FactoryDocument`, `FactoryInvite`, `FactoryActivation`, `FactoryProfile`, `AgreementVersion`, `AgreementAcceptance`. |
| Parked premium brands | `StockOffer`, `GiftOrder`, `GiftSettlement`, `BrandConversation`, `BrandMessage`, `BrandConversationRead`, `BrandOfferRevision`. |
| Configuration and notices | `Settings` is a singleton with commission, courier and agent fee per item, gateway fee rate, basket lock amount, maximum wait, payment hold, collection and return windows, agent radius and gap, deposit, and the payout watermark. `Notification` stores in-app notices and read state. |

Legacy schema values do not define the current product scope. `SHOES` still exists in the category enum, and `Product.status`, `reviewNote`, `stockType` and `defectNotes` remain for compatibility.

## Orders, baskets and fulfilment

| Trigger | Transition | Stock and money effect |
| --- | --- | --- |
| Buyer adds to cart | `CartItem` row | None |
| Checkout with an amount due | Orders `PENDING`, one `PaymentAttempt` | Available → reserved; token HOLD entries; hold for `paymentHoldMinutes` |
| Checkout fully covered by tokens | Orders `PAID` at once | Reserved → sold; SPEND marker |
| Verified payment notice | `PENDING` → `PAID`; joined to the OPEN basket for that agent and factory (created if none) | Reserved → sold; basket total grows by items total |
| Basket total reaches `basketLockAmount` | `OPEN` → `LOCKED` (`AMOUNT`) | None |
| `maxWaitDays` after the first order | `OPEN` → `LOCKED` (`MAX_WAIT`) | None |
| Agent suspended or leaving | Its OPEN baskets → `LOCKED` (`SUSPENDED`); a later payment locks at once | None |
| Payment hold passes | `PENDING` → `CANCELLED`, attempt `EXPIRED` | Reserved → available; token hold released |
| Payment arrives after expiry | Attempt `LATE_PAID` | Full amount credited as `LATE_PAYMENT` tokens |
| Buyer cancels while basket is OPEN | `PAID` → `CANCELLED` | Sold → available; basket total drops; refund as `ORDER_CANCEL` tokens |
| Factory packs | `LOCKED` → `PACKED` | None |
| Admin books courier | `CourierBooking` row | None |
| Factory marks given to driver | `PACKED` → `WITH_COURIER` | None |
| Agent marks received | `WITH_COURIER` → `AT_AGENT`; orders `PAID` → `RECEIVED` | Returns the agent sends back with this courier move to `PICKED_UP` |
| Buyer gives pickup code | Lines get `collectedAt` | None |

Missing items are reported by the factory and removed by an Agents and orders admin, refunding the buyer in tokens and queuing a `MISSING_ITEM` payout deduction. The weekly sweep builds factory payouts and credits agent fees.

### Consistency mechanisms

[locks.ts](../src/server/orders/locks.ts) fixes the lock order everywhere: user advisories (sorted) → Order rows (sorted) → basket advisory `basket:<agentId>:<factoryId>` → Basket rows → ledger User rows (sorted). Variant rows are locked after any basket advisory, in variantId order. `withOrderTransaction` takes the advisories and Order rows and retries serialization conflicts. `markOrdersPaid` holds Agent rows `FOR SHARE`, so suspension and leaving either see the new basket or the payment sees their status. Pickup lookups take a `pickup:<agentId>` advisory and are throttled per agent.

See [checkout](../src/server/orders/checkout.ts), [baskets](../src/server/orders/baskets.ts), [delivery](../src/server/orders/delivery.ts), [handover](../src/server/orders/handover.ts) and [payment notices](../src/server/payments/notice.ts) for exact guards.

## Routes by responsibility

The route tree in `src/app/` is authoritative. These are the main entry points, not a second specification of every field on each page.

| Audience | Routes | Current purpose |
| --- | --- | --- |
| Visitors and buyers | `/`, `/shop`, `/products/[id]` | Shopping home (buyer home when signed in), catalogue and product detail; `?agent=` preselects a pickup agent |
| Buyers | `/cart`, `/checkout`, `/checkout/return/[attemptId]` | Personal cart, checkout with agent choice and tokens, and the gateway return page for orders |
| Buyers | `/orders`, `/orders/[id]`, `/tokens` | Orders with basket progress, pickup code, cancellation, returns and ratings; token wallet and transfers |
| Demo gateway | `/demo-pay/[attemptId]` | Stand-in hosted payment page (`PAYMENT_GATEWAY=demo`); returns a deposit to `/agent/deposit/[id]` and orders to `/checkout/return/[attemptId]` |
| Agents and applicants | `/agents/apply`, `/agent`, `/agent/pickups`, `/agent/returns`, `/agent/tokens`, `/agent/hours`, `/agent/deposit/[id]` | Application and deposit, arriving baskets, pickup by code, held returns, tokens and leaving, opening hours, deposit return page |
| Account holders | `/account`, `/notifications`, `/dashboard` | Profile and in-app notices; `/dashboard` and `/account/location` redirect |
| Authentication | `/sign-in`, `/sign-up`, `/factories/sign-in/[token]` | Session entry, buyer registration and factory invite sign-in |
| Factories | `/factories/apply`, `/factories/apply/[token]`, `/seller/agreement` | Factory application and agreement |
| Factories | `/seller`, `/seller/orders`, `/seller/baskets`, `/seller/earnings`, `/seller/products`, `/seller/new`, `/seller/insights`, `/seller/team`, `/seller/returns` | Factory workspace by job (Owner, Sales, Packing): basket tickets and packing, payouts, listings, staff, returns and fault holds; brand accounts get the parked brand dashboard |
| Admin: Agents and orders | `/admin/agents`, `/admin/agents/applications`, `/admin/agents/deposits`, `/admin/agents/baskets`, `/admin/agents/search` | Courier to book and payment problems, applications, deposits and losses, 2-month baskets, order search |
| Admin: Factory | `/admin/factory`, `/admin/factory/applications`, `/admin/factory/applications/[id]`, `/admin/factory/missing`, `/admin/factory/quality`, `/admin/factory/returns`, `/admin/factory/returns/[id]`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Factory applications, missing-item reports, quality and fault holds, returns, products and variant stock |
| Admin: Core | `/admin/core/payouts`, `/admin/core/tokens`, `/admin/settings` | Weekly factory payouts, outstanding tokens, totals by type and lookup, settings |
| Admin: Premium | `/admin/brands` | Parked premium brand reviews and partnership messages |
| Admin: shared | `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/users/new-admin`, `/admin/users/new-seller` | `/admin` redirects to the admin's area; accounts scoped to the signed-in area |

Protected pages and actions use the guards in [session.ts](../src/server/auth/session.ts) (`requireAdmin(area)`, `requireAgent`, `requireAgentHours`, `requireFactory(section)`); services check the role again.

### HTTP endpoints

| Endpoint | Access and purpose |
| --- | --- |
| `GET /api/photos/[id]` | Public product photo with ETag caching |
| `GET /api/suggest` | Public product suggestions |
| `GET /api/agent-photos/[id]` | Agents and orders admin only; private applicant documents, no-store, 404 otherwise |
| `GET /api/return-photos/[id]`, `GET /api/report-photos/[id]` | Buyer, own factory and Factory/Core admins; private, 404 otherwise |
| `GET /api/brand-photos/[id]`, `GET /api/partner-docs/[id]` | Scoped private brand images and factory application documents |
| `POST /api/payments/notify` | Gateway notice: signature verified, applied once per `(gateway, eventId)` |
| `POST /api/cron/sweep` | Bearer `CRON_SECRET` (constant-time compare; rejects empty or `CHANGE_ME`); runs `runSweep` |
| `GET /notifications/[id]` | Signed-in user's notice read/redirect handler |

## Service and verification map

Paths below are relative to the repository root.

| Area | Implementation | Existing verification |
| --- | --- | --- |
| Cart, checkout and orders | `src/server/orders/cart.ts`, `checkout.ts`, `buyer.ts`, `locks.ts`; `src/lib/order-rules.ts`, `agent-money.ts`, `distance.ts`, `location.ts` | Adjacent unit and property tests; `tests/integration/checkout.int.test.ts` |
| Baskets | `src/server/orders/baskets.ts` (`markOrdersPaid`, `lockBasket`, cancel, expire) | `tests/integration/baskets.int.test.ts` |
| Packing, courier and receipt | `src/server/orders/delivery.ts`, `src/server/factory-dashboard.ts` | `tests/integration/delivery.int.test.ts`, `factory-fulfilment.int.test.ts`, `factory-screens.int.test.ts` |
| Pickup and hand over | `src/server/orders/handover.ts` | `tests/integration/handover.int.test.ts` |
| Agents | `src/server/agents/` (`apply.ts`, `admin.ts`, `deposit.ts`, `hours.ts`, `leave.ts`, `live.ts`, `screens.ts`, `admin-screens.ts`); `src/lib/agent-rules.ts`, `agent-hours.ts` | Adjacent unit tests; `tests/integration/agents.int.test.ts`, `agent-access.int.test.ts`, `admin-screens.int.test.ts`; `tests/e2e/agent.spec.ts` |
| Payments and notices | `src/server/payments/gateway.ts`, `demo.ts`, `notice.ts` | `src/server/payments/demo.test.ts`; `tests/integration/payments.int.test.ts` |
| Tokens and transfers | `src/server/tokens.ts`, `src/server/admin-core.ts` | `tests/integration/tokens.int.test.ts`, `token-transfer.int.test.ts`, `admin-screens.int.test.ts` |
| Weekly payouts and agent fees | `src/server/payouts/index.ts` | `tests/integration/payouts.int.test.ts`, `commission.int.test.ts` |
| Time-based rules | `src/server/sweep.ts` (`runSweep`), called from `src/app/api/cron/sweep/route.ts` | Through the suites above |
| Returns and fault holds | `src/server/returns.ts`, `fault-holds.ts`, `quality.ts`, `ratings.ts`; `src/lib/return-rules.ts`, `quality-rules.ts` | `tests/integration/returns.int.test.ts`, `fault-holds.int.test.ts`, `quality.int.test.ts`, `ratings.int.test.ts` |
| Catalogue and stock | `src/server/catalogue.ts`, `admin-queries.ts`; `src/lib/price-rules.ts`, `taxonomy.ts` | Adjacent unit tests; `tests/integration/admin.int.test.ts`, `catalogue-eligibility.int.test.ts`, `suggest.int.test.ts` |
| Factories and agreements | `src/server/partners.ts`, `agreements.ts`, `factory-admin.ts`, `factory-team.ts` | `tests/integration/partners.int.test.ts`, `agreements.int.test.ts`, `factory-admin.int.test.ts`, `factory-team.int.test.ts` |
| Parked premium brands | `src/server/brands.ts`, `brand-reviews.ts`, `brand-communications.ts`, `gifts.ts` | `tests/integration/brands.int.test.ts`, `brand-communications.int.test.ts`, `gifts.int.test.ts` |
| Notifications | `src/server/notify/index.ts` | Through the suites above |
| Admin areas and access | `src/lib/admin-access.ts`, `src/server/auth/`, `src/server/admin-users.ts` | `tests/integration/admin-areas.int.test.ts`, `login-lockout.int.test.ts`; `tests/e2e/admin-workspaces.spec.ts` |
| User experience | `src/app/`, `src/components/`, `src/server/flash.ts` | `tests/e2e/buyer.spec.ts`, `agent.spec.ts`, `factory.spec.ts`, `accessibility.spec.ts` |

The existence of a test file does not establish that the suite has passed in the current checkout. Use the checks appropriate to a change and report what was actually run.

## Deployment boundaries and known gaps

Development-only tools and CI live in [development tooling](development-tooling.md). Test
entry points share `scripts/test-database.mjs`; each serial browser spec owns its fixtures.
The optional inspection role reads sanitized views in `groupbasket_ai`, outside Prisma's
application schema. These tools do not add production integrations or deploy the application.

- **Payments:** only the demo gateway exists (`PAYMENT_GATEWAY=demo`). The PayHere adapter, its `payment_id` capture and status lookup are not built; see DEC-016.
- **Delivery:** there is no courier provider integration. Agents and orders admins book the courier by hand (driver, phone, vehicle, fee); factories mark baskets packed and given to the driver, and the agent marks them received.
- **Uploads:** [storage](../src/server/storage/index.ts) uses local disk via `STORAGE_DIR`, with a 5 MB limit. Photos support JPEG/PNG/WebP. Hosting has not been selected; ephemeral/serverless storage would require another adapter.
- **Scheduled work:** deploy an authenticated recurring call to `/api/cron/sweep`. `runSweep` is the only place time-based rules run (payment expiry, basket maximum wait, return escalation and lapse, leaving agents, weekly payouts and agent fees, fault holds, agreement reminders, notice retries); page loads do not run them, and there is no always-on worker.
- **Notifications:** [notify](../src/server/notify/index.ts) writes database notices. No email, SMS or WhatsApp delivery is implemented.
- **Parked premium brands:** `src/server/gifts.ts` and `/admin/brands` keep manual gift allocation, brand dispatch, bill approval and settlement records. Gifts are not tied to orders or baskets. `/seller` renders `brand-dashboard.tsx` for brands. Brands are excluded from shop listing.
- **Authentication and accounts:** cookie sessions use `gt_session`, hashed tokens and server-side role checks. Password reset is not implemented. Demo accounts come from the seed; their visibility is controlled by development mode or `SHOW_DEMO_LOGINS`.

Configuration variable names are listed in [.env.example](../.env.example). Never copy live secrets into documentation. The main brief and its implementation-status reference own prioritization and any business decisions required to close these gaps.

## Administrative workspaces

`User.adminArea` is `PREMIUM`, `FACTORY`, `AGENTS` or `CORE` for admins and null for everyone else; there is no unrestricted admin. `src/lib/admin-access.ts` holds `adminAreaOf`, `canAdminArea`, `userAdminArea` (brands PREMIUM, factory sellers FACTORY, everyone else AGENTS, admins their own area) and `adminHome`. `requireAdmin(area)` protects area pages and actions; `requireAnyAdmin()` serves the shared Users and Settings pages, which `src/server/admin-users.ts` (`areaUsersWhere`, `assertManagesUser`) scopes to the signed-in area. Sign-in sends each admin to `/admin/brands`, `/admin/factory`, `/admin/agents` or `/admin/core/payouts`, and the admin layout shows only that area's tabs. Each area creates admins only for itself; `npm run admin:create` (`scripts/create-admin.ts`) creates a deployment's first admins.

Agents and orders admins review agent applications and deposits, record losses, suspend agents, book couriers, remove missing items and search orders. Factory admins own factory applications, products, quality, returns and fault holds. Core admins run settings, weekly payouts and the token overview. Premium admins handle the parked brand workspace.

## Factory partnership joining (Part 1)

Applications hold private business, identity and bank fields. FactoryDocument stores private storage keys, exposed only through the FACTORY/CORE checked `/api/partner-docs/[id]` route. `partners.ts` validates submissions and serializes review/invite consumption; `partner-actions.ts` derives principals from sessions. `/factories/apply` and its invite route share the form; `/admin/factory/applications` holds review and visits. Approval links use separate hashed seven-day `FactoryActivation` rows (owner, creating admin, expiry, redeemed `usedAt` and separate `revokedAt` audit). No activation is accepted by session lookup. Approval creates these only for new owners and returns the raw URL once in the authorized admin action response; form state displays it until navigation/refresh. Notifications persist only `/sign-in`. New sign-in link requires FACTORY/CORE access, approval and activation history; it locks the owner, refuses if any activation has `usedAt` set, and revokes unused/non-revoked activations via `revokedAt` before issuing a replacement. The admin page hides this action after any redemption. Redemption locks the owner then the activation (`FOR UPDATE`), checks `usedAt = null`, `revokedAt = null`, expiry and account conditions, and atomically sets the password and used-at marker; the action then starts a normal session. GET never consumes credentials. Legacy applicants receive no activation. Migration `factory_activation_revoked` adds only the nullable `revokedAt` column; existing ambiguous `usedAt` markers are not reclassified and conservatively block reissue. Delivery uses in-app notices only. FactoryProfile, AgreementVersion and AgreementAcceptance retain lifecycle records alongside the factory User.

### Agreement eligibility

`src/lib/agreement-rules.ts` owns the pure calendar/eligibility/reminder rules; `src/server/agreements.ts` persists versions and acceptances. Publication and acceptance share an advisory transaction lock; acceptance also locks the factory profile. Published versions are append-only through services/actions. Forms bind acceptance to the version displayed. `canSell` resolves the factory account/profile/current acceptance and requires legacy checks after the grace deadline. `sellingFactoryWhere` expresses the same visibility in database queries, before limits and facet aggregation. Public catalogue queries compose eligibility with the in-shop baseline, so the brand exclusion is independent of the factory predicate. Direct detail lookup reuses only the base boundary, preserving access to sold-out ordinary products.

Listing (`saveProduct`, under the owner advisory with `canSellIn`), staff creation and admin republishing enforce the gate. `runSweep` claims reminder markers then delivers notices with deterministic IDs, allowing retries without duplicate notices. Agreement expiry never changes paid orders or prices. `(workspace)/layout.tsx` gates owners while `/seller/agreement` remains outside that group.

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

## Factory commission snapshots

`src/lib/price-rules.ts` owns Decimal buyer-price addition and commission validation. Only CORE
can call `setCommission` in `src/server/settings.ts`; the settings action derives the actor
from the session. `saveProduct` stores `factoryPrice` plus the commission in `Product.price`
for new factory listings. Creation share-locks Settings until commit; updates lock the product
and reuse its stored commission, never the current setting. Checkout snapshots `unitPrice` and
`factoryPrice` on each `OrderLine`, so later repricing never rewrites an order.

## Token ledger

`src/server/tokens.ts` implements balance, `post`, `credit` and transfers; `src/lib/token-rules.ts`
owns pure Decimal rules. `TokenEntry.amount` is the signed balance delta: positive credits and
releases, negative HOLD, zero SPEND. Database triggers reject entry updates and deletes. Order,
line and return ids are scalar audit references, so the ledger is never rewritten or cascaded.

Kinds: `RETURN`, `HOLD`, `RELEASE`, `SPEND`, `LATE_PAYMENT`, `ORDER_CANCEL`, `AGENT_FEE`,
`COURIER_REPAY`, `MISSING_ITEM`, `DEPOSIT_RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`. Unique `eventKey`
values make every credit, hold, release and spend idempotent; a replay with a different amount is
refused. `post` locks the ledger User row last in the global order and refuses an overdraft.
Only buyers and agents hold tokens (`assertTokenHolder`). `transferTokens` takes both user
advisories (sorted) then both ledger rows (sorted). There is no cash-out path.

## Factory fault holds

`FactoryFault` uniquely references a return and records units, confirmation actor/time and
cancellation audit. `FaultHold` stores cleanup and decision markers; a partial unique index
allows one open hold per factory. `FaultHoldMessage` stores private owner/admin discussion.
`Product.hiddenByHoldId` tracks which listings Continue can restore. Owners use
`/seller/returns?hold=id`; FACTORY/CORE use `/admin/factory/quality?hold=id`. SALES keeps return
access but has no fault/hold access. Queries expose no buyer identities or payment figures to
factories; selected hold routes return 404 for outsiders.

`recordFault` runs inside the return transaction when the agent collects a factory-fault return.
It records once, counts the calendar window, opens a hold with conflict-do-nothing semantics and
queues durable QualityNotice entries. After commit `enforceHold` takes the hold row FOR NO KEY
UPDATE, skips decided or cleaned holds, takes the factory advisory, then hides the factory's
products in id order and marks the hold cleaned. Orders already paid are not cancelled by a hold.
A removed factory's open hold closes as REMOVE. `runSweep` retries pending holds and committed
REMOVE decisions whose factory profile is not REMOVED.

`decideHold` locks the hold first. Continue clears only this hold's product markers; Remove commits
its decision before calling removal. Hold posting takes the hold gate then the author advisory.
Shared `private-thread.ts` helpers validate text, serialize per-author limits across return and
hold threads and deduplicate unread notices. Cancelling a fault retains audit and does not itself
decide a hold.

## Quality: hides, removal and ratings

`hideProduct` hides one non-brand product with a reason. `removeFactory` marks the profile REMOVED
under the owner advisory, optionally holds earnings, hands unresolved returns to admins, hides the
factory's products in id order, closes open holds, then locks the owner and staff accounts with
`setUserLocked`. The owner advisory also fences new listings and staff creation. Removal does not
touch paid orders or baskets; what happens to them is open in DEC-016.

`ProductRating` is unique per order, user and product, with a 1–5 database constraint.
`rateProduct` accepts only collected lines (`collectedAt` set) on RECEIVED orders and serializes
through `withOrderTransaction`. Low stars require a `QualityReport`; damage, wrong item and
stitching require private `ReportPhoto` rows, served only to the rater and FACTORY/CORE admins.
`qualityOverview` computes flags on reads.

## Returns

`ReturnRequest` belongs to an `OrderLine` and stores buyer and factory, quantity, reason, fault,
decision actors and notes, deadlines, receipt condition and the handover agent. `ReturnPhoto`
stores private image keys behind `/api/return-photos/[id]`. `ReturnNotice` is a durable
after-commit outbox. No buyer names, addresses, phones or monetary figures reach the factory list.

The move table is `src/lib/return-rules.ts`. A buyer files for a collected line within
`collectHours` of the agent receiving the order. WAITING_FACTORY → ACCEPTED or WITH_ADMIN (refusal needs a reason; no answer within 24 hours
also escalates). WITH_ADMIN → ACCEPTED or REJECTED; REJECTED is terminal. Acceptance moves the
return to AWAITING_HANDOVER at the order's agent with a `returnHandoverDays` deadline. The agent
collects it (HANDED_OVER): the line's `returnedQty` grows, the buyer is credited RETURN tokens
(`returnRefund`), and a factory fault is recorded with a RETURN_COURIER payout deduction. A return
never handed over LAPSES without tokens. When the agent marks an arriving basket received, it can
send held returns back with that courier (PICKED_UP, `sentBackBasketId`); the factory's receipt
moves them RECEIVED → COMPLETED, optionally restocking. The worn-item check before buyer-fault tokens is open in DEC-016.

`ReturnMessage` holds the private admin–factory discussion. FACTORY/CORE and the own factory
owner/SALES can read; posting requires WITH_ADMIN. Every mutation goes through `withOrderTransaction`
with sorted buyer, factory and actor advisories, the Order row, then the return row, then ledger
rows; fault holds are enforced and notices flushed after commit. `runSweep` escalates overdue
returns and lapses unhanded ones.

## Brand partnership communication (parked)

`BrandConversation`, `BrandMessage`, `BrandConversationRead` and `BrandOfferRevision` back private
brand messages. `brand-communications.ts` validates each subject and actor, locks conversations for
read/notification consistency and deduplicates sends by request key. Notice delivery runs after
commit and retries through the sweep. `brand-reviews.ts` activates approved revisions without
changing prior gift price snapshots.
