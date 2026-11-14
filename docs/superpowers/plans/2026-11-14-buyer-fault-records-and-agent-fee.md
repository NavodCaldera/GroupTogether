# Buyer-fault records and the 5% agent fee: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LKR 40 courier charge and LKR 20 agent fee with one 5% agent fee that
agents keep and pay couriers from, and turn buyer-fault returns into a tracked record with no
tokens that the agent resells privately.

**Architecture:** Money stays in `src/lib/agent-money.ts` (pure, Decimal). New orders snapshot
`courierEach = 0` and `agentFeeEach = round2(unitPrice × agentFeeRate)`, so every refund that
reads the line snapshots keeps working for old and new orders. Buyer-fault returns reuse
`ReturnRequest` with new statuses that no factory, payout or send-back query matches. A
factory-fault return takes the line's agent fee back from the agent through a clawback row
that the weekly fee credit settles.

**Tech Stack:** Next.js 16 server actions, Prisma 7 on PostgreSQL, Vitest unit and integration
tests, Playwright for browser checks.

**Spec:** [DEC-017 and DEC-018](../../decisions.md), with the rules in the
[operating brief](../../../.claude/agents/groupbasket.md) (`RETURN-001`, `ORD-004`, `PAY-004`,
`PAY-007`, `BSK-006`, `BSK-007`, `AGT-004`, `AGT-005`).

## Global Constraints

- Money uses `Decimal(14,2)` and `D`/`toD`/`roundMoney` from `src/lib/decimal.ts`; never `number`.
- `agentFeeRate` is `Decimal(6,4)`, default `0.05`, edited by CORE only, valid `0`–`0.5`.
- PayHere fee formula and `gatewayFeeRate` 0.033 are unchanged. Example: item 1,000 + fee 50 →
  PayHere fee **35.83**, total **1,085.83**.
- Orders placed before this change keep their stored `courierEach`, `agentFeeEach` and totals.
- Lock order from AGENTS.md: user advisories (sorted) → `Order` rows → basket advisory →
  `Basket` rows → ledger `User` rows (sorted). Notify only after commit.
- Time rules run only in `runSweep`.
- No explanatory text in the UI: show amounts and labels, not sentences about the rules.
- Buyer-fault reasons and copy, exactly: Material not as expected, Size, Colour, Quality feel,
  Changed mind, Other.
- Agents see prices only for buyer-fault items they hold (`DATA-001` exception). Factories never
  see buyer-fault returns.

## Review Focus

1. A factory-fault return collected **after** the weekly agent fee was paid, from an agent with
   too few tokens: the balance must stop at 0 and the rest come off the next week's fee.
2. A factory-fault return collected **before** the week's fee is credited: the fee for that unit
   must simply not be credited, not credited then clawed back.
3. Buyer-fault returns of any status must never hold a factory payout or appear in the agent's
   send-back list or a courier's return pickup.
4. An old order (courier 40, fee 20) cancelled, missing or returned after release must refund
   from its own snapshots, not from the new rate.
5. A leaving agent holding a buyer-fault item in `AWAITING_HANDOVER` or `WITH_AGENT` must not
   close.

Each line has its test in the owning task (marked **RF1**–**RF5**).

---

### Task 1: Schema and settings

**Files:**

- Modify: `prisma/schema.prisma` (`Settings`, `ReturnRequest`, `ReturnStatus`, `TokenKind`)
- Create: `prisma/migrations/20261115000000_buyer_fault_and_agent_fee/migration.sql`
- Modify: `src/app/admin/core/actions.ts:34-35`, `src/app/admin/settings/page.tsx:58-62`
- Test: `tests/integration/admin.int.test.ts`

**Interfaces:**

- Produces: `Settings.agentFeeRate: Decimal`, `Settings.buyerHandoverDays: Int` (default 2);
  `ReturnStatus` adds `BUYER_REQUESTED`, `WITH_AGENT`, `SOLD`, `TAKEN_BACK`; `TokenKind` adds
  `FEE_CLAWBACK`; enum `BuyerFaultReason { MATERIAL SIZE COLOUR QUALITY_FEEL CHANGED_MIND OTHER }`;
  `ReturnRequest.buyerReason BuyerFaultReason?`, `ReturnRequest.reason ReportReason?` (nullable),
  `ReturnRequest.changedToBuyerAt DateTime?`, `ReturnRequest.resoldAt DateTime?`,
  `ReturnRequest.takenBackAt DateTime?`; model `AgentFeeClawback { id, agentId, returnId @unique,
  amount Decimal(14,2), left Decimal(14,2), createdAt }` with `@@index([agentId, left])`.
- Removes: `Settings.courierPerItem`, `Settings.agentFeePerItem`.

- [ ] **Step 1: Write the failing test** `it("CORE saves the agent fee rate between 0 and 0.5")`:
      saving `0.05` stores `0.0500`; `0.6` and `-0.01` throw; a FACTORY admin is refused.
- [ ] **Step 2: Run it and see it fail.** Run: `npm run test:int -- admin.int` (PowerShell).
      Expected: FAIL, unknown field `agentFeeRate`.
- [ ] **Step 3: Edit the schema, then run `npx prisma migrate dev --name buyer_fault_and_agent_fee`.**
      The migration must set `agentFeeRate` to `0.05` on the existing Settings row. Replace the two
      Settings inputs with one "Agent fee (%)" field that stores `percent / 100`.
- [ ] **Step 4: Run the test.** Expected: PASS. `npm run typecheck` will fail in later files;
      Tasks 2–3 fix them.
- [ ] **Step 5: Commit** `feat: add agent fee rate and buyer-fault return fields`.

### Task 2: Money rules

**Files:**

- Modify: `src/lib/agent-money.ts`
- Test: `src/lib/agent-money.test.ts`, `src/lib/agent-money.property.test.ts`

**Interfaces:**

- Produces:
  - `type Rates = { agentFeeRate: D; gatewayFeeRate: D }`
  - `agentFeeEach(unitPrice: D, rate: D): D`, which is `roundMoney(unitPrice × rate)`
  - `orderTotals(lines, r): { items: D; agentFee: D; gross: D }`, with no `courier` field
  - `factoryFaultRefund(qty, unitPrice, courierEach, agentFeeEach): D`, which is
    `(unitPrice + courierEach + agentFeeEach) × qty`
- Removes: `returnRefund`, since buyer fault now refunds nothing.

- [ ] **Step 1: Write the failing tests.** Assert each of these:
  - `orderTotals([{qty:1, unitPrice:1000}])` gives agentFee `50.00` and gross `1050.00`.
  - The PayHere fee on `1050` at `0.033` is `35.83`.
  - `agentFeeEach(999.99, 0.05)` is `50.00`.
  - `factoryFaultRefund(2, 1000, 0, 50)` is `2100.00`.
  - `factoryFaultRefund(1, 1000, 40, 20)` is `1060.00` (an old order, **RF4**).

  In the property test, check that agentFee equals the sum of `agentFeeEach × qty`.
- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run --project unit src/lib/agent-money`
      from PowerShell. Expected: FAIL.
- [ ] **Step 3: Implement the functions.** Delete the old `courier` assertions and the
      `returnRefund` tests.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: 5% agent fee money rules`.

### Task 3: Checkout, receipt and agent fees

**Files:**

- Modify: `src/server/orders/checkout.ts:50-60,270-280`, `src/app/checkout/page.tsx`,
  `src/app/cart/page.tsx`, `src/server/orders/delivery.ts:403-410`,
  `src/server/payouts/index.ts:134-194`, `src/server/agents/screens.ts:60-95,175-205`
- Test: `tests/integration/checkout.int.test.ts`, `delivery.int.test.ts`, `payouts.int.test.ts`,
  `tests/integration/helpers.ts`

**Interfaces:**

- Consumes: `orderTotals`, `agentFeeEach` (Task 2), `Settings.agentFeeRate` (Task 1).
- Produces:
  - New `OrderLine` rows store `courierEach = 0.00` and `agentFeeEach = agentFeeEach(unitPrice, rate)`.
  - New `Order` rows store `courierTotal = 0.00`.
  - `markBasketReceived` no longer posts `COURIER_REPAY`.
  - `creditAgentFees` pays `agentFeeEach × (qty − missingQty − returnedQty)`, then settles the
    open clawbacks (Task 5 adds the clawback rows).

- [ ] **Step 1: Write the failing tests.**
  - `it("charges 5% agent fee and no courier at checkout")`: a 1,000 item gives amountDue
    `1085.83` and `courierTotal` `0`.
  - `it("receipt credits no courier repayment")`: the agent's balance is unchanged after Mark
    received.
  - `it("agent fee excludes factory-fault returned units")`: qty 2, returnedQty 1, fee 50 gives
    an `AGENT_FEE` of `50.00` (**RF2**).
  - Update the helpers so `makeReceivedOrder` takes `agentFeeEach` (default `"50"`) and
    `courierEach` (default `"0"`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:int -- checkout delivery payouts`.
- [ ] **Step 3: Implement.** Checkout and cart show the rows Item, Agent fee, Tokens, PayHere fee
      and Total. In `creditAgentFees`, compute each agent's amount **inside**
      `withOrderTransaction([fee.userId], [], …)` so it serializes with `collectReturn`, which
      already holds the agent's user advisory. The agent screen totals keep showing past
      `COURIER_REPAY` entries.
- [ ] **Step 4: Run the tests, then the whole suite.** Run: `npm run test:int`, then `npm run check`.
      Expected: PASS. Update any older test that asserted 40/20 to read from its own snapshots
      (**RF4**: one test cancels a 40/20 order and gets 1,096.17 back).
- [ ] **Step 5: Commit** `feat: agents keep the 5% fee and pay couriers`.

### Task 4: Buyer-fault filing and the Agents and orders decision

**Files:**

- Modify: `src/lib/return-rules.ts`, `src/server/returns.ts` (`fileReturn`, new functions),
  `src/server/payouts/index.ts:19-24,34-46`, `src/app/orders/[id]/page.tsx`,
  `src/app/orders/[id]/actions.ts`, `src/app/seller/returns/page.tsx` via `factoryReturns`
- Create: `src/app/admin/agents/returns/page.tsx`, `src/app/admin/core/returns/page.tsx`,
  `src/app/admin/buyer-returns.tsx` (shared list and per-product counts)
- Test: `src/lib/return-rules.test.ts`, `tests/integration/returns.int.test.ts`

**Interfaces:**

- Produces:
  - `MOVES` gains these transitions:
    - `BUYER_REQUESTED → [AWAITING_HANDOVER, REJECTED]`
    - `WITH_ADMIN → [..., BUYER_REQUESTED]`
    - `AWAITING_HANDOVER → [HANDED_OVER, WITH_AGENT, LAPSED]`
    - `WITH_AGENT → [SOLD, TAKEN_BACK]`
  - `fileReturn(buyerId, orderLineId, input)`, where `input` is
    `{ fault: "FACTORY"; reason: ReportReason; photos (≥1) }` or
    `{ fault: "BUYER"; buyerReason: BuyerFaultReason; photos (optional) }`, plus `note` and `qty`.
    A buyer-fault return starts as `BUYER_REQUESTED` with `factoryDueAt = now`, and only the
    AGENTS admins are notified.
  - `buyerFaultDecide(adminId, returnId, accept: boolean, note: string)`, AGENTS area only. Accept
    goes to `AWAITING_HANDOVER` through `toHandover` with `buyerHandoverDays`. Refuse goes to
    `REJECTED`. The buyer is notified after commit, and the agent too on accept.
  - `changeToBuyerFault(adminId, returnId, note)`, FACTORY area, from `WITH_ADMIN` only. It sets
    `fault = BUYER`, `changedToBuyerAt`, and status `BUYER_REQUESTED`, and notifies AGENTS admins
    and the buyer. It records no fault.
  - `buyerFaultHistory(adminId)` for AGENTS or CORE. It returns the rows plus
    `{ productId, title, factory, counts: Record<BuyerFaultReason, number> }[]`.
  - `PAYOUT_HOLD_RETURNS` applies to `fault: "FACTORY"` only, so `payableLines` filters on
    `{ status: { in: … }, fault: "FACTORY" }`.
  - `factoryReturns` returns `fault: "FACTORY"` only.

- [ ] **Step 1: Write the failing tests.**
  - `it("buyer fault files as BUYER_REQUESTED with a reason and no photo")`.
  - `it("factory sees no buyer-fault return and gets no notice")`.
  - `it("AGENTS admin accepts: 2-day handover at the order's agent; refuse closes REJECTED")`.
  - `it("FACTORY or CORE admin cannot decide a buyer-fault return")`.
  - `it("Factory admin changes a factory fault to buyer fault: BUYER_REQUESTED, no fault, AGENTS notified")`.
  - `it("buyer-fault returns never hold the factory payout")`, covering each of
    BUYER_REQUESTED, AWAITING_HANDOVER and WITH_AGENT (**RF3**).
  - `it("history counts reasons per product for AGENTS and CORE only")`.
  - A rule test asserts the new `MOVES`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
  - **Buyer form:** a fault choice (Factory fault, Buyer fault). For Buyer fault it shows the
    six reasons and the line "You get LKR {factoryPrice × qty} if it sells", with no other text.
  - **Admin pages:** each one calls `requireAdmin("AGENTS")` or `requireAdmin("CORE")` and renders
    `buyer-returns.tsx`.
  - **Accept and Refuse:** only on the AGENTS page.
  - **Change to buyer fault:** a button on `src/app/admin/factory/returns/page.tsx` for
    `WITH_ADMIN` rows.
- [ ] **Step 4: Run the tests.** Run: `npm run test:int -- returns payouts`, then `npm run check`.
      Expected: PASS.
- [ ] **Step 5: Commit** `feat: buyer-fault returns as an Agents and orders record`.

### Task 5: Agent collection, resale and the factory-fault fee clawback

**Files:**

- Modify: `src/server/returns.ts` (`collectReturn`, `lapseReturns`, new functions),
  `src/server/tokens.ts:18-29,150`, `src/server/agents/screens.ts`, `src/server/agents/leave.ts:21-41`,
  `src/app/agent/actions.ts`, `src/app/agent/returns/page.tsx`
- Test: `tests/integration/returns.int.test.ts`, `agents.int.test.ts`, `tokens.int.test.ts`

**Interfaces:**

- Consumes: `factoryFaultRefund` (Task 2), statuses and `buyerFaultDecide` (Task 4).
- Produces:
  - `collectReturn(agentUserId, returnId, now)` handles both faults:
    - **Factory fault:** adds to `returnedQty`, records the fault, credits
      `factoryFaultRefund(...)` as `RETURN`, and creates no `RETURN_COURIER` deduction. If the
      fee event `agentfee:<agentId>:<weekOf(order.receivedAt)>` already exists, it calls
      `clawBackFee(tx, agent, r, amount)`.
    - **Buyer fault:** moves to `WITH_AGENT` with no tokens and no `returnedQty` change.
  - `clawBackFee(tx, agent: { id; userId }, r, amount: D)` creates an `AgentFeeClawback` with
    `left = amount`, then posts `FEE_CLAWBACK` (a negative kind) for `min(balance, left)` and
    lowers `left` by that amount.
  - `settleClawbacks(tx, agentId, userId)` is called by `creditAgentFees` after it posts each
    `AGENT_FEE`. It posts `FEE_CLAWBACK` for each row's `min(balance, left)`, oldest first.
  - `markResold(agentUserId, returnId)` moves `WITH_AGENT → SOLD` and sets `resoldAt`.
    `markTakenBack(agentUserId, returnId)` moves `WITH_AGENT → TAKEN_BACK` and sets
    `takenBackAt`. Both are handover-agent only.
  - `lapseReturns` also lapses buyer-fault `AWAITING_HANDOVER` past `handoverDueAt` into
    `LAPSED`, which the buyer sees as "Not brought".
  - `settled()` in leave.ts also counts buyer-fault `AWAITING_HANDOVER` and `WITH_AGENT`.
  - `resaleItems(agentId)` returns `{ id, title, size, qty, price: unitPrice × qty,
    buyerShare: factoryPrice × qty }[]` for `WITH_AGENT` returns.

- [ ] **Step 1: Write the failing tests.**
  - `it("factory fault after the fee week: buyer gets 1050, agent loses 50")`.
  - `it("clawback with balance 20: balance 0, 30 left, taken from next week's fee")` (**RF1**).
  - `it("factory fault before the fee week: no clawback row, fee excludes the unit")` (**RF2**).
  - `it("buyer fault collect: WITH_AGENT, no tokens, not in heldReturns or send-back")` (**RF3**).
  - `it("agent marks Sold or Taken back; others cannot")`.
  - `it("buyer fault not brought in 2 days lapses in the sweep")`.
  - `it("a leaving agent holding a buyer-fault item does not close")` (**RF5**).
  - `it("factory-fault return creates no RETURN_COURIER deduction")`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** The agent Returns page gets a To resell section listing each item
      with its title, size, Price and Buyer gets, plus Sold and Taken back buttons. Add
      `FEE_CLAWBACK` to `NEGATIVE_KINDS`, and make the Core token report show it.
- [ ] **Step 4: Run the tests and all checks.** Run: `npm run test:int`, then `npm run check`.
      Expected: PASS.
- [ ] **Step 5: Commit** `feat: agent resale records and factory-fault fee clawback`.

### Task 6: Seed, browser checks and docs

**Files:**

- Modify: `prisma/seed.ts`, `tests/e2e/*.spec.ts` (return and checkout journeys),
  `docs/implementation-status.md`, `docs/architecture.md`, `.claude/agents/{orders-baskets,payments,agents,courier}.md`,
  `docs/CHANGES.md`
- Test: Playwright desktop and 360 px

- [ ] **Step 1: Seed the demo data.** Seed one buyer-fault return in each of `BUYER_REQUESTED`,
      `WITH_AGENT` and `SOLD`, and order lines using the 5% fee.
- [ ] **Step 2: Write the browser checks.**
  - The buyer files a buyer-fault return and sees the "You get" amount.
  - The AGENTS admin accepts it.
  - The agent collects it and marks it Sold.
  - Checkout shows Agent fee 50 and Total 1,085.83.
  - Each screen passes axe at 360 px.

  Run them with `npm run e2e` and expect PASS.
- [ ] **Step 3: Update the docs.**
  - Set the status rows to Implemented.
  - Describe the new statuses, `AgentFeeClawback` and `FEE_CLAWBACK` in the architecture doc.
  - Remove the "not built" notes from the brief and the specialists.
  - Add a changelog entry.
  - Run `npm run check:docs`.
- [ ] **Step 4: Commit** `docs: buyer-fault records and 5% agent fee built`.

## Not in this plan

- A factory refusing a factory-fault return parcel (`DEC-018` 3). The existing admin–factory
  return thread covers follow-up until it needs its own state.
- The condition check before factory-fault tokens (`DEC-016` question 3).
