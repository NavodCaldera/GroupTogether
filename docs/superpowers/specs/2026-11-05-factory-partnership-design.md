# Factory partnership — technical design

**Date:** 2026-11-05 · **Status:** Draft for owner approval
**Business contract:** [spec](../../../specs/001-factory-partnership/spec.md) (approved) · `DEC-013`
**Builder:** Codex writes the code from per-part prompts; Claude Code tests each part.

## Intent

Make every factory prove who it is and accept a dated agreement before it sells, watch quality
per product, and give buyers tokens (never cash, `PAY-003`) when an item is cancelled or returned.
Business rules are fixed by the spec; this document only decides how to build them.

## Goals, non-goals, anti-goals

- **Goals:** spec FR-001 to FR-033 (with FR-007a, FR-019a, FR-023a), built in four parts, each
  shippable and tested before the next.
- **Non-goals:** factory payouts, the rest of the 3–4 Nov dashboard plan, the legal agreement text,
  automatic removal.
- **Anti-goals (failure even if it "works"):** a token spent twice or created without a ledger
  line; a private document reachable by anyone except Factories/core admins; a buyer price that
  changes on an existing listing; a paid cart's total silently changing; float money.

## Constraints from the codebase

- A factory is a `User` with `role = SELLER`; staff are `User`s with `factoryId` and `factoryRole`.
- `CartLine` has no status; a paid cart is paid, delivered or cancelled only as a whole.
- `Delivery` is one per cart; returns need their own pickup record.
- Private uploads go through `src/server/storage` (`saveUpload`, private keys), as payment slips do.
- Deadlines run in `sweep()` (`src/server/carts/service.ts`), called by `/api/cron/sweep`.
- Notifications: `notify()` / `notifyRole()` in `src/server/notify`.
- Money is `Decimal(14,2)` through `src/lib/decimal.ts`; pure rules live in `src/lib/*-rules.ts` with
  unit tests, database work in `src/server/*`.
- Next.js here is a non-standard version: read `node_modules/next/dist/docs/` before writing pages
  or actions.
- Admin areas: `FACTORY` (Factories admin) and `CORE` (settings and admin accounts).

## Approaches considered

1. **New tables beside the factory login (chosen).** A `FactoryProfile` per factory user, a token
   ledger, and a status on each cart line. The rest of the app keeps working; every money event is
   traceable.
2. **Extra columns on `User` and a balance number for tokens.** Quicker, but a single balance
   cannot prove where tokens came from or stop double spending under concurrent carts.
3. **Separate `Factory` entity replacing the seller user.** Cleanest model, but rewrites every
   seller, staff, packing and rating query — far more risk than this change needs.

Owner picked the build order; Claude chose approach 1 (owner left the technical side to Claude).

## Data model (new and changed)

All new money columns are `Decimal(14,2)`.

**Part 1 — joining**
- `FactoryApplication`: business name, BR number, owner name, owner NIC, phone, email, address,
  city, bank name/branch/account name/account number, `status` (`WAITING`, `APPROVED`,
  `REJECTED`), reviewer, reviewedAt, reviewNote, visit date and notes (optional), `inviteId?`,
  `factoryUserId?` (set on approval). Index on `brNumber` and `ownerNic` for the reapply block.
- `FactoryDocument`: applicationId, kind (`BR_CERT`, `NIC_PHOTO`, `FACTORY_PHOTO`),
  storageKey, contentType. Served only through an admin-checked route.
- `FactoryInvite`: token (random, single use), phone/email, invitedBy, expiresAt, usedAt.
- `AgreementVersion`: version number, text, publishedAt, publishedBy (core admin). Immutable.
- `AgreementAcceptance`: factoryUserId, acceptedById, versionId, acceptedAt, endsAt (+12 months),
  remindedAt.
- `FactoryProfile` (one per factory user): `status` (`ACTIVE`, `REMOVED`), `complianceDueAt`
  (legacy factories: go-live + 30 days; null for new ones), removedAt, removedBy, removalReason,
  `earningsHeld` boolean + note (FR-022).

**Part 2 — commission and tokens**
- `Settings.commissionPerPiece` (default 100).
- `Product.factoryPrice` and `Product.commission` (snapshot at creation). `Product.price` stays the
  buyer price = factoryPrice + commission, so every existing price path is untouched. Existing
  products keep `price`; their `factoryPrice` = price − 100 and `commission` = 100 (migration).
  Commission applies only to factory listings (`sellerId` set); GroupBasket's own and lot products
  keep today's pricing (Claude's call).
- `TokenEntry` (append-only ledger): userId, `amount` (+ gain, − spend/hold), `kind`
  (`CANCELLATION`, `RETURN`, `HOLD`, `RELEASE`, `SPEND`), cartLineId?, returnId?, note, createdAt.
  Balance = sum of entries. A unique key on (cartLineId, kind) for `HOLD`/`RELEASE`/`SPEND` and on
  (cartLineId, `CANCELLATION`) / (returnId, `RETURN`) stops double events.
- `CartLine.tokensApplied` (Decimal, default 0, ≤ qty × unitPrice).
- Owner transfer (slip amount) = cart total − sum of `tokensApplied`. Cart minimum still uses the
  full total (FR-025).

**Part 3 — quality**
- `CartLine.status` (`ACTIVE`, `CANCELLED`, `RETURNED`), cancelledAt, cancelReason, `notEarned`
  boolean (read later by payouts).
- `ProductRating`: productId, cartId, userId, stars 1–5, createdAt; unique (cartId, userId,
  productId) — once per product per order.
- `QualityReport`: ratingId, reason (`DAMAGED`, `WRONG_ITEM`, `STITCHING`, `SIZE`, `OTHER`), note,
  photos (storage keys).
- `Product.hiddenAt`, hiddenBy, hiddenReason; status `HIDDEN` not added — hidden products are
  filtered by `hiddenAt`.
- Flags are computed, not stored: a query returns flagged products and factories from ratings and
  reports (FR-018). Old `FactoryRating` rows join the factory score one-for-one.

**Part 4 — returns**
- `Delivery.deliveredAt` (set when the drop is marked delivered) starts the 2-day window.
- `ReturnRequest`: cartLineId, buyerId, qty, reason, `fault` (`FACTORY`, `BUYER`), photos,
  `status` (`WAITING_FACTORY`, `WITH_ADMIN`, `ACCEPTED`, `REJECTED`, `PICKED_UP`, `RECEIVED`,
  `COMPLETED`), factoryDecidedAt, factoryDueAt (+2 days), escalatedAt, adminDecision, adminId,
  pickup provider ref, receivedCondition note.

## Behaviour by part

**Part 1 — joining and agreement.** Public page `/factories/apply` and `/factories/apply/<invite>`.
Submission validates all required fields and at least one of each document (FR-002), refuses a BR
or NIC seen on a rejected application (FR-005). Factories admin queue under `/admin/factory`:
open documents, record a visit, approve (blocked when bank account name equals neither business
nor owner name, case- and space-insensitive) or reject. Approval creates the factory `User`
(SELLER) and `FactoryProfile`, and sends a sign-in link. A guard `canSell(factoryUserId, now)`
returns false unless the profile is active and there is an acceptance of the **latest** version
with `endsAt > now`, or the legacy `complianceDueAt > now`. It wraps listing, staff adding, and the
shop's product queries (hidden when false). Core admin publishes versions under `/admin/settings`.
Sweep: 30-day reminder (once, `remindedAt`) and listing hiding at expiry happen through `canSell`,
so nothing needs to be deleted.

**Part 2 — commission and tokens.** Seller form asks for the factory price and shows the buyer
price live. Only `CORE` admins can change `commissionPerPiece`. Tokens: a member applies tokens to
their own line while the cart is `OPEN`/`READY`; one transaction locks the user's ledger
(`SELECT … FOR UPDATE` on the user row), checks balance ≥ amount and amount ≤ line value, writes a
`HOLD` entry and sets `tokensApplied`. Removing the line, leaving, expiry or cancellation before
payment writes a `RELEASE`. Slip approval converts holds into `SPEND`. Owner sees the reduced
transfer amount; members see their balance on their account page.

**Part 3 — quality.** After delivery, each receiver rates each product once (FR-015) with report
and photo rules (FR-016). Product and factory scores computed in `src/lib/quality-rules.ts`.
Factories admin sees a flag list; actions: hide product, remove factory. Hiding: product hidden,
removed from unpaid carts (holds released), and every `ACTIVE` line of it in undelivered paid
carts becomes `CANCELLED` + `notEarned`, with a `CANCELLATION` token entry for its owner equal to
qty × unitPrice (the full price, including any part paid with tokens — spec edge case) and a
notification with the reason. Removing a factory: profile `REMOVED`, staff
locked, all its products hidden, same cancellation for all undelivered paid lines; if every line
of a paid cart is cancelled the cart becomes `CANCELLED`. No message to the factory.

**Part 4 — returns.** On a delivered line, within 2 days of `Delivery` marked delivered, the buyer
files a return (photo required for factory-fault reasons). Factory owner/sales sees it and accepts
or rejects; sweep moves it to `WITH_ADMIN` after 2 days. Buyer may escalate a rejection; admin's
decision is final. Accepted factory fault: pickup booked through the delivery provider, factory
pays. Accepted buyer fault: buyer arranges delivery. When the factory marks it received (buyer
fault: confirms unused with tags), line becomes `RETURNED` + `notEarned`, and a `RETURN` token
entry equal to the line price is written.

## Access

- Documents: route checks `role = ADMIN` and `adminArea ∈ {FACTORY, CORE}`; never public URLs.
- Commission and agreement versions: `CORE` only.
- Hide, remove, application review, return escalations: `FACTORY` (and `CORE`).
- Token apply: only on the caller's own line.

## Testing (done by Claude Code after each Codex part)

- Unit tests for every new rule in `src/lib` (prices, `canSell`, flags, return windows, token
  limits), plus money property tests in the existing style.
- Integration tests on the `groupbasket_test` database: double token spend under concurrent carts,
  hide/remove cancellations, return lifecycle, reapply block, document access.
- `npm run check`, `npm run test:int`, `npm run build`, and browser checks with `playwright-cli`
  at 360px. Repo review skills: money, cart concurrency, access, browser.

## Claude's calls (check these)

- Approach 1 and the four-part order.
- Commission only on factory listings; existing factory products migrate to price − 100 + 100.
- Flags computed on demand, not stored.
- Hidden products use `hiddenAt` rather than a new product status.
- Return window starts at a new `Delivery.deliveredAt`.

## Left to the builder

Page layouts within the existing style (owner's dashboard layout rules still apply), exact field
labels, migration names, and splitting server files sensibly.
