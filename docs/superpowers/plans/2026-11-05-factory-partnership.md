# Factory Partnership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This project:** each Part below is handed to Codex as one prompt; Claude Code then runs the
> Part's verification and the repo review skills before the next Part starts.

**Goal:** Factories join through checks and a versioned agreement, buyers see factory price plus
commission, quality is tracked per product, and cancellations and returns pay buyers in tokens.

**Architecture:** New tables beside the existing factory `User` (approach 1 of the design). Pure
rules in `src/lib/*-rules.ts` with unit tests; database work in `src/server/*`; pages under
`src/app`. Tokens are an append-only ledger; cart lines gain a status.

**Tech Stack:** Next.js (non-standard version — read `node_modules/next/dist/docs/` first),
Prisma/PostgreSQL, `decimal.js` via `src/lib/decimal.ts`, Vitest (unit + integration projects),
zod, playwright-cli.

**Spec:** [design](../specs/2026-11-05-factory-partnership-design.md) ·
[business spec](../../../specs/001-factory-partnership/spec.md) · `DEC-013`

## Global Constraints

- Money: `Decimal(14,2)` columns, `src/lib/decimal.ts` helpers, never `number` for rupees; `npm run check:money` must pass.
- No cash or bank refunds anywhere (`PAY-003`). Only the cart owner pays (`PAY-001`).
- Cart minimum uses full item value, before tokens (`CART-001`, FR-025).
- One active cart per buyer (`CART-003`); one factory per cart (`FUL-001`).
- 1 token = LKR 1; tokens never expire; spend only on own lines; up to full line value.
- Commission default **LKR 100 per piece**; only `CORE` admins change it; applies to new listings only.
- Agreement term **12 months**; reminder **30 days** before end; legacy factories **30 days** to comply.
- Returns: apply within **2 days** of delivery; factory answers within **2 days** else to admin.
- Flags: product < **3.0** over **10+** ratings, or **3** reports in **30 days**; factory < **3.0** over **20+** ratings, or **3+** flagged products. Never automatic action.
- Private documents: only `ADMIN` with `adminArea` `FACTORY` or `CORE`.
- Removal sends **no** message to the factory; affected buyers are told the reason.
- UI: phone first (360px), no explainer/description lines in the UI (owner rule), existing colour tokens.
- Each Part: `npm run check`, `npm run test:int`, `npm run build` green before commit; stage files by path.
- Record each Part in `docs/CHANGES.md`, `docs/implementation-status.md` and affected `.claude/agents/*.md`.

## Review Focus

1. Two carts spending the same tokens at the same moment → only one succeeds (Task 2.3 test).
2. A buyer opening another factory's or applicant's document URL directly → 403/404 (Task 1.2 test).
3. Hiding a product in a cart where the line used tokens → buyer gets tokens for the full price once, not twice, even if the hide runs twice (Task 3.3 test).
4. Commission changed while a factory is creating a listing → existing listings keep their price; only listings created after the change use it (Task 2.1 test).
5. Return filed exactly at the 2-day boundary, and a factory deciding after its 2 days → boundary inclusive at 48h; late factory decision refused once with admin (Task 4.1 test).

---

## Part 1 — Joining, checks and agreement

### Task 1.1: Schema for applications, documents, invites, agreements, profiles

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration `prisma/migrations/<ts>_factory_partnership_joining/`
- Modify: `prisma/seed.ts` (one agreement v1, profiles for demo factories with `complianceDueAt`)

**Interfaces:**
- Produces models/enums exactly as in the design: `FactoryApplication` (`ApplicationStatus`:
  `WAITING|APPROVED|REJECTED`), `FactoryDocument` (`FactoryDocKind`: `BR_CERT|NIC_PHOTO|FACTORY_PHOTO`),
  `FactoryInvite`, `AgreementVersion`, `AgreementAcceptance`, `FactoryProfile`
  (`FactoryStatus`: `ACTIVE|REMOVED`).
- Migration data step: every existing `SELLER` user without `factoryId` gets a `FactoryProfile`
  with `complianceDueAt = migration time + 30 days`.

- [ ] Step 1: Add models, run `npx prisma migrate dev --name factory_partnership_joining`; expected: migration created, client generated.
- [ ] Step 2: Run `npm run typecheck`; expected: PASS.
- [ ] Step 3: Commit.

### Task 1.2: Application, review and private documents

**Files:**
- Create: `src/lib/partner-rules.ts`, `src/lib/partner-rules.test.ts`
- Create: `src/server/partners.ts`, `src/server/partner-actions.ts`
- Create: `src/app/factories/apply/page.tsx`, `src/app/factories/apply/[token]/page.tsx`
- Create: `src/app/admin/factory/applications/page.tsx`, `.../[id]/page.tsx`
- Create: `src/app/api/partner-docs/[id]/route.ts`
- Test: `tests/integration/partners.int.test.ts`

**Interfaces:**
- `bankNameMatches(accountName: string, businessName: string, ownerName: string): boolean` — case-, space- and punctuation-insensitive equality with either.
- `missingItems(input: ApplicationInput, docs: FactoryDocKind[]): string[]`
- `submitApplication(input: ApplicationInput, files: { kind: FactoryDocKind; file: File }[], inviteToken?: string): Promise<{ id: string }>` — throws `PartnerError`.
- `createInvite(adminId: string, contact: { phone?: string; email?: string }): Promise<{ token: string }>` (7-day expiry, single use).
- `reviewApplication(adminId: string, id: string, decision: "APPROVE" | "REJECT", note?: string): Promise<void>` — approve creates SELLER `User` + `FactoryProfile`, sends sign-in link via `notify`.
- `recordVisit(adminId: string, id: string, date: Date, notes: string): Promise<void>`

- [ ] Step 1: Unit tests: `bankNameMatches("LANKA SHIRTS (PVT) LTD", "Lanka Shirts (Pvt) Ltd", "Kamal Perera") === true`; `bankNameMatches("K. Perera", "Lanka Shirts", "Kamal Perera") === false`; `missingItems` lists `"BR certificate"`, `"NIC photo"`, `"Factory photo"` when absent.
- [ ] Step 2: Integration tests: submit without NIC photo → `PartnerError` naming it; reapply with a rejected BR number → refused; reapply with a rejected NIC → refused; approve with mismatched bank name → refused; approve valid → seller user + ACTIVE profile exists; used invite token reused → refused; `GET /api/partner-docs/<id>` as CUSTOMER, SELLER, ADMIN(PREMIUM) → 404; as ADMIN(FACTORY) and ADMIN(CORE) → 200.
- [ ] Step 3: Run `npm test -- partner-rules` and `npm run test:int -- partners`; expected: FAIL.
- [ ] Step 4: Implement; uploads through `saveUpload(file, "partner-docs", IMAGE_TYPES)`; doc route streams from `storage()` after the admin-area check.
- [ ] Step 5: Run both; expected: PASS. Commit.

### Task 1.3: Agreement versions, acceptance and the selling guard

**Files:**
- Create: `src/lib/agreement-rules.ts`, `src/lib/agreement-rules.test.ts`
- Create: `src/server/agreements.ts`
- Create: `src/app/seller/agreement/page.tsx`; Modify: `src/app/admin/settings/page.tsx` (publish version, CORE only)
- Modify: seller listing actions (`src/server/seller-actions.ts`), staff adding (`src/server/factory-team-actions.ts`), shop product queries (`src/server/catalogue.ts`), `src/server/carts/service.ts` `sweep()`
- Test: `tests/integration/agreements.int.test.ts`

**Interfaces:**
- `sellingAllowed(p: { status: FactoryStatus; complianceDueAt: Date | null; acceptance: { versionId: string; endsAt: Date } | null; latestVersionId: string | null }, now: Date): boolean`
- `endsAtFor(acceptedAt: Date): Date` (+12 calendar months).
- `reminderDue(endsAt: Date, remindedAt: Date | null, now: Date): boolean` (≤ 30 days left, not yet reminded).
- `canSell(factoryUserId: string, now?: Date): Promise<boolean>`; `publishVersion(coreAdminId: string, text: string)`; `acceptLatest(ownerUserId: string, now?: Date)`.
- Seller layout redirects owners to `/seller/agreement` while `canSell` is false.

- [ ] Step 1: Unit tests: accepted 2026-12-01 → `endsAtFor` = 2027-12-01; `sellingAllowed` false when REMOVED, false when acceptance is of an older version, false after `endsAt`, true for legacy within `complianceDueAt`, false for legacy after it; `reminderDue` true at 30 days left, false at 31, false if already reminded.
- [ ] Step 2: Integration tests: listing and staff adding refused before acceptance; publishing a new version blocks listing until re-accepted; non-CORE admin publishing → refused; after expiry (`now` injected) the factory's products are absent from shop queries but a paid cart for them keeps status; sweep sends one reminder.
- [ ] Step 3: Run; expected FAIL. Implement. Run; expected PASS. Commit.

### Part 1 verification (Claude Code)
`npm run check`, `npm run test:int`, `npm run build`; skills `groupbasket-access-review`, `groupbasket-browser-review` (apply form at 360px, admin review, agreement gate).

---

## Part 2 — Commission and tokens

### Task 2.1: Commission on top of factory price

**Files:**
- Modify: `prisma/schema.prisma` (`Settings.commissionPerPiece Decimal @default(100)`, `Product.factoryPrice Decimal?`, `Product.commission Decimal?`), migration with data step (existing seller products: `commission = 100`, `factoryPrice = price - 100`)
- Create: `src/lib/price-rules.ts`, `src/lib/price-rules.test.ts`
- Modify: `src/server/seller-actions.ts`, seller product form, `src/server/settings.ts`, `src/app/admin/settings/page.tsx`
- Test: `tests/integration/commission.int.test.ts`

**Interfaces:**
- `buyerPrice(factoryPrice: Decimal.Value, commission: Decimal.Value): D`
- `validCommission(v: Decimal.Value): boolean` (≥ 0, 2 dp).
- `setCommission(adminId: string, amount: string): Promise<void>` — CORE only.

- [ ] Step 1: Unit: `buyerPrice("1400", "100")` equals `"1500.00"`; `validCommission("-1") === false`; `validCommission("0") === true`.
- [ ] Step 2: Integration: commission 100 → listing at 1400 has price 1500; CORE sets 120 → that product still 1500, a new 1400 listing is 1520; FACTORY admin `setCommission` → refused.
- [ ] Step 3: FAIL → implement → PASS. Commit.

### Task 2.2: Token ledger

**Files:**
- Modify: `prisma/schema.prisma` (`TokenEntry`, `TokenKind`: `CANCELLATION|RETURN|HOLD|RELEASE|SPEND`; `CartLine.tokensApplied Decimal @default(0)`)
- Create: `src/lib/token-rules.ts`, `src/lib/token-rules.test.ts`, `src/server/tokens.ts`
- Test: `tests/integration/tokens.int.test.ts`

**Interfaces:**
- `balanceOf(entries: { amount: Decimal.Value }[]): D`
- `maxApplicable(balance: Decimal.Value, lineValue: Decimal.Value, alreadyApplied: Decimal.Value): D`
- `tokenBalance(userId: string, tx?: Tx): Promise<D>`
- `credit(tx: Tx, userId: string, amount: D, kind: "CANCELLATION" | "RETURN", ref: { cartLineId?: string; returnId?: string }, note: string): Promise<void>` — idempotent on (ref, kind).
- `applyTokens(userId: string, cartLineId: string, amount: string): Promise<void>` — locks user row `FOR UPDATE`, line must be caller's and cart `OPEN|READY`; writes `HOLD` (negative) and sets `tokensApplied`.
- `releaseLineTokens(tx: Tx, cartLineId: string): Promise<void>`; `spendCartTokens(tx: Tx, cartId: string): Promise<void>` (HOLD → SPEND marker, no balance change).

- [ ] Step 1: Unit: balance of [+3000, −1500] = 1500; `maxApplicable(3000, 1500, 0)` = 1500; `maxApplicable(500, 1500, 0)` = 500.
- [ ] Step 2: Integration: apply more than balance → refused; apply to another member's line → refused; apply over line value → refused; two concurrent `applyTokens` of 1500 with balance 1500 on two carts → exactly one succeeds (`Promise.allSettled`); `credit` called twice with same ref → one entry.
- [ ] Step 3: FAIL → implement → PASS. Commit.

### Task 2.3: Tokens in the cart flow

**Files:**
- Modify: `src/server/carts/service.ts` (`setLine` qty 0, `leaveCart`, `cancelCart`, `sweep` expiry → `releaseLineTokens`; slip approval in `src/server/carts/slips.ts` → `spendCartTokens`; owner amount due), cart page member line UI, `src/app/account` balance
- Modify: `src/lib/cart-rules.ts`: `amountDue(total: Decimal.Value, tokensApplied: Decimal.Value[]): D`
- Test: extend `tests/integration/carts.int.test.ts`, `src/lib/cart-money.property.test.ts`

- [ ] Step 1: Tests: Kasun 3000 tokens applies 1500 on his 1500 line in Nimal's cart → `amountDue` = total − 1500 and `meetsMinimum` uses full total; Kasun removes line → balance back to 3000; cart expires unpaid → tokens back; slip approved → balance stays 1500 and HOLD is SPEND; property test: `amountDue` never negative and never above total.
- [ ] Step 2: FAIL → implement → PASS. Commit.

### Part 2 verification (Claude Code)
All checks; skills `groupbasket-money-review`, `groupbasket-cart-concurrency`, browser at 360px.

---

## Part 3 — Ratings, reports, flags, hide and remove

### Task 3.1: Line status and per-item cancellation

**Files:**
- Modify: `prisma/schema.prisma` (`LineStatus`: `ACTIVE|CANCELLED|RETURNED`; `CartLine.status`, `cancelledAt`, `cancelReason`, `notEarned Boolean @default(false)`; `Product.hiddenAt`, `hiddenById`, `hiddenReason`)
- Create: `src/server/cancellations.ts`
- Test: `tests/integration/cancellations.int.test.ts`

**Interfaces:**
- `cancelPaidLines(tx: Tx, lineIds: string[], reason: string): Promise<void>` — only lines `ACTIVE` in carts `CONFIRMED|DISPATCHED`; sets `CANCELLED`, `notEarned`; `credit(…, qty × unitPrice, "CANCELLATION", { cartLineId })`; notifies each line owner with the reason; cart → `CANCELLED` when no `ACTIVE` lines remain. Idempotent.
- Cart totals shown to users exclude `CANCELLED` lines; stored `total` unchanged (it is what was paid).

- [ ] Step 1: Tests: cancel one of two lines → one token credit of full price (even if 500 of it was tokens), cart stays `CONFIRMED`; cancel last line → cart `CANCELLED`; run twice → still one credit; line in `DELIVERED` cart → untouched.
- [ ] Step 2: FAIL → implement → PASS. Commit.

### Task 3.2: Product ratings and reports

**Files:**
- Modify: `prisma/schema.prisma` (`ProductRating`, `QualityReport`, `ReportReason`: `DAMAGED|WRONG_ITEM|STITCHING|SIZE|OTHER`)
- Create: `src/lib/quality-rules.ts`, `src/lib/quality-rules.test.ts`
- Modify: `src/server/ratings.ts` (add `rateProduct`, keep `rateFactory` reads for history), delivered-cart page rating UI
- Test: `tests/integration/ratings.int.test.ts`

**Interfaces:**
- `reportRequired(stars: number): boolean` (stars ≤ 2); `photoRequired(reason: ReportReason): boolean` (DAMAGED, WRONG_ITEM, STITCHING).
- `factoryScore(productStars: number[], oldFactoryStars: number[]): { average: number; count: number }` — each old rating counts once.
- `rateProduct(userId: string, cartId: string, productId: string, stars: number, report?: { reason: ReportReason; note: string; photos: File[] }): Promise<void>` — user must own an `ACTIVE`/`RETURNED` line of that product in a `DELIVERED` cart.

- [ ] Step 1: Unit: `reportRequired(2) === true`, `reportRequired(3) === false`; `photoRequired("SIZE") === false`; `factoryScore([5,1],[3])` = `{ average: 3, count: 3 }`.
- [ ] Step 2: Integration: non-receiver → refused; second rating same cart+product → refused; 2 stars without report → refused; STITCHING without photo → refused; with photo → saved.
- [ ] Step 3: FAIL → implement → PASS. Commit.

### Task 3.3: Flags, hide product, remove factory

**Files:**
- Modify: `src/lib/quality-rules.ts` (flag functions), Create: `src/server/quality.ts`, `src/app/admin/factory/quality/page.tsx`
- Test: `tests/integration/quality.int.test.ts`

**Interfaces:**
- `productFlagged(stars: number[], reportDates: Date[], now: Date): boolean`; `factoryFlagged(score: { average: number; count: number }, flaggedProducts: number): boolean`.
- `hideProduct(adminId: string, productId: string, reason: string): Promise<void>` — sets `hiddenAt`; removes it from unpaid carts (`releaseLineTokens` then delete line); `cancelPaidLines` for its undelivered paid lines.
- `removeFactory(adminId: string, factoryUserId: string, reason: string, holdEarnings: boolean, note?: string): Promise<void>` — profile `REMOVED`, staff and factory users `locked`, all products hidden as above, no notification to factory users.

- [ ] Step 1: Unit: 10 ratings averaging 2.9 → flagged; 9 ratings at 1 → not flagged by average; 3 report dates within 30 days → flagged; 3 spread over 31 days → not; factory 20 ratings at 2.9 → flagged; 3 flagged products → flagged.
- [ ] Step 2: Integration: hide → absent from shop, removed from an OPEN cart with tokens released, paid line cancelled with tokens; hide twice → one credit; remove factory → staff cannot sign in, no `Notification` for factory users, buyers notified; FACTORY admin allowed, PREMIUM admin refused; other products of the factory unaffected by a single hide.
- [ ] Step 3: FAIL → implement → PASS. Commit.

### Part 3 verification (Claude Code)
All checks; money, cart-concurrency, access and browser review skills.

---

## Part 4 — Returns

### Task 4.1: Return requests

**Files:**
- Modify: `prisma/schema.prisma` (`ReturnRequest`, `ReturnStatus`, `ReturnFault`; `Delivery.deliveredAt DateTime?` set where delivery is marked delivered)
- Create: `src/lib/return-rules.ts`, `src/lib/return-rules.test.ts`, `src/server/returns.ts`
- Create pages: buyer return form on the delivered cart page; `src/app/seller/returns/page.tsx` (OWNER, SALES); `src/app/admin/factory/returns/page.tsx`
- Modify: `sweep()` → `escalateOverdue(now)`
- Test: `tests/integration/returns.int.test.ts`

**Interfaces:**
- `withinWindow(deliveredAt: Date, now: Date): boolean` (≤ 48h inclusive); `factoryOverdue(createdAt: Date, now: Date): boolean` (> 48h).
- `fileReturn(buyerId: string, cartLineId: string, input: { reason: ReportReason; fault: "FACTORY" | "BUYER"; note: string; photos: File[] }, now?: Date)`
- `factoryDecide(staffUserId: string, returnId: string, accept: boolean, now?: Date)` — refused once `WITH_ADMIN`.
- `escalate(buyerId: string, returnId: string)`; `adminDecide(adminId: string, returnId: string, accept: boolean, note: string)` — final.
- `markReceived(staffUserId: string, returnId: string, unusedWithTags: boolean)` — buyer fault requires `true`; then line `RETURNED`, `notEarned`, `credit(…, line price for qty, "RETURN", { returnId })`.
- Factory-fault accepted → book pickup via `src/server/delivery` provider with `paidBy = "FACTORY"`.

- [ ] Step 1: Unit: delivered 10:00 day 1 → window true at 10:00 day 3, false at 10:01; `factoryOverdue` true after 48h.
- [ ] Step 2: Integration: late filing refused; factory-fault without photo refused; factory accepts → pickup booked paidBy FACTORY; received → tokens = full line price, line `RETURNED`; buyer fault received not unused → refused tokens; factory silent 48h → sweep moves to `WITH_ADMIN` and late `factoryDecide` refused; rejection escalated → admin accept credits tokens; second credit attempt → none.
- [ ] Step 3: FAIL → implement → PASS. Commit.

### Part 4 verification (Claude Code)
All checks, all four review skills, end-to-end browser run of the Lanka Shirts example at 360px.
