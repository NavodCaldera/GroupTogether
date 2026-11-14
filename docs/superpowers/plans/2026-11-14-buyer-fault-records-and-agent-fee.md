# Full build plan: buyer-fault records (DEC-017) and the 5% agent fee (DEC-018)

> **Built 2026-11-15** on `main`. Where the build differs from this plan: owed fee take-backs come
> off the deposit when a leaving agent closes (no `AgentLoss` row); the migration has no data move
> (nothing was deployed); the weekly agent fee excludes `returnedQty` (only factory-fault
> collections raise it); no extra `WITH_AGENT` or `SOLD` seed fixtures; Settings parsing lives in
> `src/lib/agent-settings.ts`.

## Context

The owner decided two rule changes on 2026-11-14 (recorded in `docs/decisions.md` DEC-017 and
DEC-018, and in the operating brief rules `RETURN-001`, `ORD-004`, `PAY-004`, `PAY-007`,
`BSK-006`, `BSK-007`, `AGT-004`, `AGT-005`):

1. **Buyer-fault returns become a tracked record with no tokens.** The buyer picks the fault when
   filing. A buyer-fault return gets one of six reasons and a note (photos optional), goes to the
   **Agents and orders** admin (never the factory), and on acceptance the buyer has **2 days** to
   hand it to the order's agent. The agent then holds it and marks it **Sold** or **Taken back**.
   It never holds the factory payout, never changes `returnedQty`, never goes back to the factory.
   A Factory admin may change a factory-fault return (in `WITH_ADMIN`) to buyer fault. The history
   (reasons per product) is visible to AGENTS and CORE admins only. The agent sees price and buyer
   share (factory price) for items it holds. An agent cannot close while holding one.
2. **One 5% agent fee replaces the LKR 40 courier charge and LKR 20 agent fee.** The agent keeps
   all of it and pays every courier; `COURIER_REPAY` ends. Factory-fault return courier: the
   factory pays the driver on arrival, so the `RETURN_COURIER` deduction ends. A factory-fault
   return refunds item price **+ agent fee** (not the PayHere fee) and the fee is **taken back from
   the agent** (tokens, else next weekly fee). Buyer fault refunds nothing. Old orders keep their
   stored snapshots. Example: 1,000 item → fee 50, PayHere 35.83, total **1,085.83**.

Three code-wide sweeps found everything that reads or writes these paths. This plan replaces the
earlier six-task draft in `docs/superpowers/plans/2026-11-14-buyer-fault-records-and-agent-fee.md`
(update that file to match once approved) and adds what the draft missed.

## Decisions settled here (owner asked Claude to settle small points)

- New `ReturnStatus` values: `BUYER_REQUESTED`, `WITH_AGENT`, `SOLD`, `TAKEN_BACK`. Buyer fault
  reuses `AWAITING_HANDOVER` (2-day due), `REJECTED`, `LAPSED` (shown as "Not brought").
- New enum `BuyerFaultReason { MATERIAL, SIZE, COLOUR, QUALITY_FEEL, CHANGED_MIND, OTHER }`; the
  shared `ReportReason` (ratings) is untouched. `ReturnRequest.reason` becomes nullable.
- New `TokenKind.FEE_CLAWBACK` (negative). New table `AgentFeeClawback` tracks the unpaid rest.
- Keep `COURIER_REPAY` and `RETURN_COURIER` enum values (ledger trigger forbids edits; old rows).
- New `OrderLine` rows store `courierEach = 0.00`, `agentFeeEach = roundMoney(unitPrice × rate)`;
  `Order.courierTotal = 0.00`. All refund paths keep reading snapshots, so old orders stay right.
- Settings: `agentFeeRate Decimal(6,4) @default(0.05)`, `buyerHandoverDays Int @default(2)`.
  CORE enters the fee as a percent ("Agent fee (%)", 5) stored as `/100`; valid 0–50.
- Agent leaving with an unpaid clawback rest: the rest is recorded as an `AgentLoss` before
  `DEPOSIT_RETURN` (fills the DEC-018 gap; note in DEC-018).
- Existing open BUYER-fault rows: none in production (not deployed); the seed is rewritten. The
  migration moves any open `fault='BUYER'` rows in `WAITING_FACTORY|WITH_ADMIN` to
  `BUYER_REQUESTED` and leaves others.
- Labels, no explanatory sentences: buyer sees "You get LKR 900 if it sells" (amount only).

---

## Task 1 — Schema, migration, settings, check script

**Files:** `prisma/schema.prisma`, new `prisma/migrations/2026111500000_buyer_fault_and_agent_fee/migration.sql`,
`scripts/check-money.mjs:9-11`, `tests/tooling/check-money.test.mjs`, `src/app/admin/core/actions.ts:29-62`,
`src/app/admin/settings/page.tsx:54-87`, `src/server/settings.ts` (no change, picks defaults).

- Settings: drop `courierPerItem`, `agentFeePerItem`; add `agentFeeRate`, `buyerHandoverDays`.
- Enums: `ReturnStatus` +4, `TokenKind` + `FEE_CLAWBACK`, new `BuyerFaultReason`.
- `ReturnRequest`: `reason ReportReason?`, `buyerReason BuyerFaultReason?`, `changedToBuyerAt`,
  `resoldAt`, `takenBackAt`, `buyerDecidedById String?`; `@@index([fault, status, createdAt])`.
- New model `AgentFeeClawback { id, agentId, returnId @unique, amount Decimal(14,2), left Decimal(14,2), createdAt }`
  `@@index([agentId, left])`.
- Migration must **drop and re-add** `TokenEntry_amount_sign` (latest version in
  `prisma/migrations/20261108160000_remove_group_carts/migration.sql:28-32`) adding `FEE_CLAWBACK`
  to the negative list; set `agentFeeRate=0.05` on the existing row; status data move above.
- `check-money.mjs:10`: allow `(gatewayFeeRate|agentFeeRate)` at `Decimal(6, 4)`; add tooling test case.
- Settings action: replace the two `money()` fields with `agentFeePercent` (regex like
  `gatewayFeeRate` at :36-39, refine ≤ 50, store `/100` via `D`) and `buyerHandoverDays: whole(1,30)`.
- Settings page tuple list: replace rows :56-62 with `["Agent fee (%)", …]`; add
  `["Buyer return handover (days)", "buyerHandoverDays", …]`.
- Tests: `tests/integration/admin.int.test.ts` — CORE saves 5 → 0.0500; 60 and −1 refused;
  FACTORY admin refused.

## Task 2 — Money rules (`src/lib/agent-money.ts`)

- `Rates = { agentFeeRate: D; gatewayFeeRate: D }`; `OrderTotals = { items, agentFee, gross }`.
- `agentFeeEach(unitPrice, rate) = roundMoney(unitPrice.times(rate))`.
- `orderTotals` fee = Σ `agentFeeEach × qty`; gross = items + fee.
- Replace `returnRefund` with `factoryFaultRefund(qty, unitPrice, courierEach, agentFeeEach)` =
  `(unitPrice + courierEach + agentFeeEach) × qty` (old lines keep courier 40; new lines courier 0).
- `missingRefund`, `missingDeduction`, `lineEarning`, `gatewayFee`, `splitCheckout`, `cancelRefund` unchanged (fix comments).
- Tests (`agent-money.test.ts`, `.property.test.ts`): fee 50/gross 1050; PayHere(1050)=35.83;
  `agentFeeEach(999.99,0.05)=50.00`; `factoryFaultRefund(1,1000,0,50)=1050`, `(1,1000,40,20)=1060`;
  split case recompute (grosses 1050 and 493.50; total fee on 1543.50 = 52.67); missing deduction 155.

## Task 3 — Checkout, receipt, weekly agent fees, clawback settlement

**Files:** `src/server/orders/checkout.ts:52-62,262-263,275-276`, `src/server/orders/cart.ts:41-46`,
`src/app/cart/page.tsx:99-102`, `src/app/checkout/page.tsx:84-85`, `src/app/orders/[id]/page.tsx:165-168`,
`src/server/orders/delivery.ts:329-333,406-412`, `src/server/payouts/index.ts:129-194`,
`src/server/tokens.ts:18-29`, `src/server/agents/screens.ts:175-206`, `src/app/agent/tokens/page.tsx:34`,
`src/app/admin/core/tokens/page.tsx:10-23`, `tests/integration/helpers.ts:144-189`.

- `ratesOf` reads `agentFeeRate`; snapshots per line as decided; `courierTotal` "0.00".
- Cart/checkout: remove the Courier row. Order page: show Courier only when `courierTotal > 0`.
- `markBasketReceived`: delete the `COURIER_REPAY` post (:406-412); fix doc comment.
- `creditAgentFees`: per agent-week, run inside `withOrderTransaction([agentUserId], [], …)` (serialises
  with `collectReturn`, which holds the agent's user advisory). Amount = Σ `agentFeeEach ×
  (qty − missingQty − factoryFaultReturnedQty)` where factory-fault returned qty comes from
  `ReturnRequest` rows with `fault: FACTORY` and status in `HANDED_OVER|PICKED_UP|RECEIVED|COMPLETED`
  (not `returnedQty`, which only factory fault changes anyway but keep explicit). After posting
  `AGENT_FEE`, call `settleClawbacks(tx, agentId, userId)`: for each `AgentFeeClawback` with
  `left > 0` oldest first, post `FEE_CLAWBACK` for `min(balance, left)` and lower `left`.
- `tokens.ts`: add `FEE_CLAWBACK` to `NEGATIVE_KINDS`; `COURIER_REPAY` stays listed (history).
- Agent tokens screen: keep "Courier repaid" only when > 0 (history); show "Fees taken back".
- Core tokens page `KIND` map: add `FEE_CLAWBACK` label (typecheck forces it).
- `helpers.ts` `makeReceivedOrder`: params `agentFeeEach = "55"`, `courierEach = "0"`, totals follow;
  `tokensApplied` 1155·qty.
- Tests to update (values from sweep): `checkout.int` (1194.42, 2388.83, 1028.96, 1155/2690/−1155),
  `baskets.int:137-149` (1188.96), `delivery.int` (no `COURIER_REPAY`; balances 0.00; 1155/155),
  `payouts.int` (110, 55, 0/55/1155), `handover.int`, `agent-access.int`, `factory-screens.int`,
  `admin-screens.int`, `agents.int` (1160→1155), `tests/e2e/buyer.spec.ts:84` (drop "Courier"),
  `tests/e2e/fault-hold.spec.ts:30,34` (0/150/3150, line 0/75), `src/server/payments/demo.test.ts` (1085.83).
- New tests: no `COURIER_REPAY` at receipt; fee excludes factory-fault returned unit; clawback
  settles from next week's fee.

## Task 4 — Return rules, filing, AGENTS decision, change-to-buyer, history

**Files:** `src/lib/return-rules.ts:1-33` (+test), `src/server/returns.ts` (many sites below),
`src/server/return-actions.ts:10-42`, `src/components/return-form.tsx`, `src/components/return-card.tsx`,
`src/app/orders/[id]/{page,actions}.tsx`, `src/server/orders/buyer.ts:84-104` (optional WITH_AGENT row),
`src/server/payouts/index.ts:19-24,38`, `src/server/factory-dashboard.ts:199-205,260`,
new `src/app/admin/agents/returns/page.tsx`, new `src/app/admin/core/returns/page.tsx`,
new shared `src/app/admin/buyer-returns.tsx`, `src/app/admin/layout.tsx:32-48`,
`src/server/admin-queries.ts:11-39`, `src/app/admin/factory/returns/page.tsx`, `[id]/page.tsx`.

- `MOVES`: `BUYER_REQUESTED → [AWAITING_HANDOVER, REJECTED]`; `WITH_ADMIN → +BUYER_REQUESTED`;
  `AWAITING_HANDOVER → +WITH_AGENT`; `WITH_AGENT → [SOLD, TAKEN_BACK]`. Mirror in `RETURN_STATUSES`.
- `fileReturn` (returns.ts:221-306): branch on fault. BUYER: require `buyerReason`, photos optional,
  status `BUYER_REQUESTED`, `factoryDueAt = now`, **queue only `"agents"`** (no factory/"admin"
  notice; removed-factory → WITH_ADMIN path must not apply). FACTORY: unchanged.
- `UNCOLLECTED_RETURN_STATUSES` (:30-35): buyer-fault rows never enter `returnedQty`, so count
  `BUYER_REQUESTED|AWAITING_HANDOVER(BUYER)|WITH_AGENT|SOLD|TAKEN_BACK` against the line too
  (`orders/[id]/page.tsx:81,94` `left` must subtract the same).
- `queue()` (:74-130): `"agents"` href → `/admin/agents/returns`.
- New `buyerFaultDecide(adminId, returnId, accept, note)`: `requireAgentsAdmin`/`assertAdminArea(AGENTS)`,
  from `BUYER_REQUESTED`; accept → `toHandover` using `buyerHandoverDays`; refuse → `REJECTED`;
  notify buyer (+agent via `announceHandover`).
- `toHandover` (:308-335): pick `buyerHandoverDays` when `r.fault === "BUYER"`.
- New `changeToBuyerFault(adminId, returnId, note)`: FACTORY area, `WITH_ADMIN` only; sets
  `fault=BUYER`, `changedToBuyerAt`, status `BUYER_REQUESTED`; no `FactoryFault`; queue `"agents"` + buyer.
- `adminDecide` refuses `fault === "BUYER"`. `factoryDecide`/`escalateOverdue`/`handoffRemovedReturns`
  are safe via status, add explicit `fault: "FACTORY"` filters.
- `returnPhotoFor` (:555-587): BUYER fault → deny factory users and FACTORY admins (unless they
  changed it); allow AGENTS and CORE admins.
- `factoryReturns` (:588-597) and `factory-dashboard.ts:199-205` filter `fault: "FACTORY"`.
- `PAYOUT_HOLD_RETURNS` use: `payableLines` (:38) and `factory-dashboard.ts:260` → `{ status: in, fault: "FACTORY" }`.
- `adminReturns` (:665-676): AGENTS → factory-fault pickups **plus** all buyer-fault states; FACTORY →
  `fault: FACTORY` only; CORE → all. New `buyerFaultHistory(adminId)` (AGENTS|CORE) returns rows +
  per-product counts (join `orderLine → variant → product`).
- `returnSelect` (:686-712): add `buyerReason`, new timestamps, `orderLine.unitPrice/factoryPrice`.
- `return-actions.ts`: add ops `buyer-decide`, `change-to-buyer`, `sold`, `taken-back`; revalidate the
  new admin and agent paths.
- UI: `return-form.tsx` — fault choice first; Buyer → six reasons + "You get LKR {factoryPrice×qty} if it sells";
  photos optional. `return-card.tsx` — labels for `BUYER_REQUESTED` ("Waiting for approval"),
  `LAPSED` ("Not brought"), `WITH_AGENT` ("With agent"), `SOLD`, `TAKEN_BACK`; show `buyerReason`;
  AGENTS viewer gets Accept/Refuse; FACTORY admin gets "Change to buyer fault" on `WITH_ADMIN`.
  `orders/[id]/page.tsx:127-129` badge tones.
- Admin nav `layout.tsx`: AGENTS `["/admin/agents/returns","Buyer returns",badges.buyerReturns]`;
  CORE `["/admin/core/returns","Buyer returns",0]`. `adminBadges`: count `BUYER_REQUESTED` for AGENTS.
  Pages use `requireAdmin("AGENTS")` / `requireAdmin("CORE")` and render `buyer-returns.tsx`.
- Tests (`returns.int`): buyer fault files as `BUYER_REQUESTED`, no factory notice; AGENTS accept →
  2-day due; FACTORY/CORE cannot decide; change-to-buyer path; photo access; history visibility;
  buyer-fault never holds payout (RF3, in `payouts.int`); quantity check blocks refiling.
  Update breaking tests: `returns.int:220`, `fault-holds.int:82`, `agent-access.int:47-53,200-203`
  (replace `factoryDecide` on BUYER with `buyerFaultDecide`), `returns.int:350`.
  `tests/e2e/admin-workspaces.spec.ts:55-64,84,100` tab lists and denied routes.

## Task 5 — Agent collection, resale, factory-fault clawback, leaving

**Files:** `src/server/returns.ts:415-464` (`collectReturn`), `lapseReturns`, new `markResold`/`markTakenBack`,
new `clawBackFee`, `src/server/agents/screens.ts` (new `resaleItems`, `returnsToCollect` fault badge),
`src/server/agents/leave.ts:21-38,41-80`, `src/server/orders/delivery.ts:382-394` (add `fault: FACTORY`),
`src/app/agent/returns/page.tsx`, `src/app/agent/actions.ts`, `src/app/agent/agent-forms.tsx`, `src/app/agent/page.tsx:103-124`.

- `collectReturn`: FACTORY → `returnedQty` up, `recordFault`, **no** `RETURN_COURIER` deduction,
  credit `factoryFaultRefund` as `RETURN`; if `tokenEntry` with eventKey
  `agentfee:<agentId>:<weekOf(order.receivedAt)>` exists, `clawBackFee(tx, agent, r, agentFeeEach×qty)`
  (create `AgentFeeClawback`, post `FEE_CLAWBACK min(balance,left)`); else the fee simply won't be
  credited (Task 3 excludes it). BUYER → `WITH_AGENT`, no tokens, no `returnedQty`, notice "Item with agent".
- `markResold` / `markTakenBack`: handover agent only, from `WITH_AGENT`; set `resoldAt`/`takenBackAt`.
- `lapseReturns`: unchanged logic; buyer notice title "Not brought".
- `settled()` in leave.ts: add `WITH_AGENT` (and buyer-fault `AWAITING_HANDOVER`, already included).
  `closeLeavingAgents`: sum `AgentFeeClawback.left` → create `AgentLoss` before `DEPOSIT_RETURN`.
- `resaleItems(agentId)`: `WITH_AGENT` rows with title, size, qty, `price = unitPrice×qty`,
  `buyerShare = factoryPrice×qty`.
- Agent Returns page: third `Section` "To resell" with Price / Buyer gets and Sold / Taken back
  buttons (pattern `CollectButton`, `agent-forms.tsx:121-134`). Home "Returns to collect" shows fault badge.
- Tests: factory fault after fee week → buyer 1050, agent −50; balance 20 → 0 and 30 left, taken
  next week (RF1); before fee week → no clawback row (RF2); buyer fault → `WITH_AGENT`, not in
  `heldReturns`/send-back, send-back of a `WITH_AGENT` id refused (`delivery.int:229`); Sold/Taken back
  authorisation; lapse at 2 days via sweep; leaving agent with `WITH_AGENT` does not close (RF5,
  `agents.int`); no `RETURN_COURIER` created.

## Task 6 — Seed, demo accounts, browser checks, docs

- `prisma/seed.ts:535-542`: file Sachini's return as BUYER with `buyerReason: "SIZE"`, decide with
  `buyerFaultDecide(agentsAdmin.id, …)`; add one `WITH_AGENT` and one `SOLD` fixture (new buyer/agent
  keys in `src/lib/demo-accounts.ts:56-72`); update header comment. `tests/integration/seed.int.test.ts:119-126`.
- E2E: `agent.spec.ts:79-89` → after Collected, item appears under "To resell", click Sold;
  `buyer.spec.ts:122` still passes (2-day due); `factory.spec.ts:153` drop "Held" expectation for the
  buyer-fault line; new: buyer files buyer fault and sees "You get"; AGENTS admin accepts; checkout
  shows Agent fee 50 / 1,085.83; axe at 360 px on new screens.
- Docs: `docs/implementation-status.md` rows 29, 34, 36, 38, 39, 44 → Implemented;
  `docs/architecture.md` (:28, :32, :53, :74-81, :94, :133, :189, :233-254 rewrite);
  `.claude/agents/groupbasket.md` (:28, :80, :94, :103, :108, :112, :113, :117, :120, :124, :133,
  :134, :152 DATA-001 exception, :170 UX-002); specialists orders-baskets, payments, agents, courier,
  notifications (:8-27 stale), frontend (:45), qa-review (:29), backend-data (:31); `.agents/skills/
  groupbasket-money-review/SKILL.md:10`; `specs/003-area-agent-model/spec.md` (US1 :48-50, US5
  :126-140, FR-003, FR-017–023, FR-026, FR-029, FR-030, FR-032); DEC-017/018 "built" dates;
  `docs/CHANGES.md` entry; replace the earlier draft plan file with this plan.

## Not in scope

- Factory refusing a returned parcel (DEC-018 point 3): follow-up through the existing thread.
- Condition check before factory-fault tokens (DEC-016 Q3).
- PayHere switch and other DEC-016 items.

## Verification

- After each task: `npm run check` (money check, doc links, typecheck, lint, tooling, unit).
- Integration: `node scripts/local-db.mjs start test` then `npm run test:int` (serial, ~2 min).
- Browser: `npm run e2e` (desktop + 360 px, axe) after Task 6; seed via `npm run db:seed`.
- Manual run (`npm run dev`): checkout a 1,000 item → Agent fee 50, PayHere 35.83, total 1,085.83;
  file a buyer-fault return → AGENTS admin sees it, Factory admin does not; accept → agent collects →
  Sold; factory-fault return → buyer gets 1,050, agent's token history shows −50 or next-week fee reduced.
- Dev DB: run `npm run db:deploy` (it also lacks `20261109100000_deposit_attempt_principal`).
- Commit after each task, stage by path, push to `origin main`.
