# Area Agent Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace buyer-run group carts and bank slips with area agents. Buyers pay upfront through
a PayHere-style gateway, paid orders fill an agent's basket for each factory, buyers collect with a
pickup code, factories get cash every Sunday, and everyone else gets tokens.

**Architecture:** New Prisma models sit alongside the old cart tables until the new flow passes
its tests; then the old code and tables are deleted. Pure money, area and week rules live in
`src/lib/`. Services in `src/server/orders/`, `src/server/payments/`, `src/server/agents/` and
`src/server/payouts/` mutate inside transactions with a fixed lock order. Notices go out after
commit. One gateway interface has a demo implementation now and PayHere later.

**Tech Stack:** Next.js 16.4 (App Router; read `node_modules/next/dist/docs/` before page or
route code), React 19, Prisma 7 + PostgreSQL, decimal.js, zod, Vitest (unit + integration),
Playwright.

**Spec:** [design](../specs/2026-11-07-area-agent-model-design.md) and
[specs/003-area-agent-model/spec.md](../../../specs/003-area-agent-model/spec.md). Read both
before any task. Where they differ, the design's "Builder check answers" win.

## Global Constraints

- Money is `Decimal(14,2)` in the database and `D`/`toD`/`roundMoney` from `src/lib/decimal.ts`
  in code. Never a JavaScript `number` for an amount. `npm run check:money` must pass.
- Settings defaults: `courierPerItem` 40, `agentFeePerItem` 20, `gatewayFeeRate` 0.033,
  `basketLockAmount` 50000, `maxWaitDays` 60, `paymentHoldMinutes` 15, `collectHours` 48,
  `returnHandoverDays` 7, `agentRadiusM` 1000, `agentGapM` 2000, `agentDeposit` 200000,
  `commissionPerPiece` 100.
- PayHere fee: `round2(remainder / (1 − rate) − remainder)`, 0 when the remainder is 0. LKR 1,000
  item + 40 + 20 at 0.033 → fee **36.17**, total **1,096.17**.
- GroupBasket pays cash only to factories. Buyers and agents get tokens only. There is no cash
  back. Factory accounts and factory staff hold no tokens.
- Weeks end Saturday 23:59:59 Asia/Colombo (fixed UTC+05:30, no daylight saving).
- Lock order everywhere: user advisory locks (sorted) → `Order` rows (sorted) → basket advisory
  `basket:<agentId>:<factoryId>` → `Basket` rows → ledger `User` rows (sorted). No gateway calls
  inside a transaction.
- Roles are checked in server queries and actions, not only in pages.
- UI: every screen works at 360 px; the most important item comes first on each home; no
  explanation or description text in the UI; the existing light/dark theme tokens are kept.
- In-app notices only (`src/server/notify`), sent after commit.
- Git: work on `main`; stage files by path, never `git add -A` (other sessions share the folder);
  commit and `git push origin main` at the end of every task, ending the message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- All development data is demo data; the seed is rewritten (FR-036).

## Review Focus

1. **Notice arrives after the 15-minute hold expired** (stock already released). Expected: the
   orders stay `CANCELLED`, the attempt becomes `LATE_PAID`, and the full amount is credited once as
   `LATE_PAYMENT` tokens, even if the same notice is posted three times. Test in Task 7.
2. **Two notices for different buyers push the same basket over LKR 50,000 at once.** Expected:
   exactly one basket locks, a new `OPEN` basket opens, and the second order goes to the basket
   that was open when its transaction got the basket lock. Test in Task 7.
3. **Weekly deductions bigger than earnings** (missing items and factory-fault return courier in a
   quiet week). Expected: `net` is never below 0; the unpaid remainder carries forward as a deduction
   on the next payout. Test in Task 12.
4. **A buyer types a wrong or another agent's pickup code.** Expected: no items are shown and
   nothing changes, and after 5 wrong codes in 10 minutes the agent's code box is blocked for 10
   minutes. Test in Task 10.
5. **Token transfer to oneself, to a factory account, a negative or 3-decimal amount, or more than
   the balance**, including two transfers racing. Expected: refused, and the balance never goes
   below 0. Test in Task 4.

---

## File Structure

| Path                                                         | Responsibility                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `prisma/schema.prisma`, `prisma/migrations/2026110710*`      | New models and enums; old tables dropped in Task 18                   |
| `src/lib/agent-money.ts`                                     | Checkout totals, fee, fee split, refunds, deductions                  |
| `src/lib/agent-rules.ts`                                     | Area gap, nearest agent, opening hours, week ending, pickup code form |
| `src/lib/order-rules.ts`                                     | Order, basket, return status moves                                    |
| `src/server/orders/locks.ts`                                 | `withOrderTransaction`, basket advisory lock (replaces carts/locks)   |
| `src/server/tokens.ts`                                       | Ledger: generic post, order holds, transfers                          |
| `src/server/payments/{gateway,demo,notice}.ts`               | Adapter, demo gateway, notice handling                                |
| `src/server/orders/{cart,checkout,baskets,delivery,handover}.ts` | Buyer cart, checkout, fill/lock/cancel, courier and receipt, pickup |
| `src/server/returns.ts` (modified)                           | Returns on `OrderLine` with agent handover                            |
| `src/server/agents/{apply,admin,hours}.ts`                   | Applications, deposit, suspension, leaving, losses, hours             |
| `src/server/payouts/index.ts`                                | Weekly factory payouts and agent fee credits                          |
| `src/server/sweep.ts`                                        | One sweep for the cron route                                          |
| `src/app/...`                                                | Role screens (Tasks 14–17)                                            |
| `tests/integration/*.int.test.ts`                            | One file per service                                                  |

---

### Task 0: Safety tag and memory

- [ ] **Step 1:** `git tag before-agent-model && git push origin before-agent-model`. Expected: the
      tag appears in `git ls-remote --tags origin`.
- [ ] **Step 2:** Update the memory file `codex-builds-claude-reviews.md` and its `MEMORY.md` line:
      from 2026-11-07, Claude builds.

### Task 1: Schema for the agent model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261107100000_agent_model/migration.sql` (via `prisma migrate dev`)
- Modify: `tests/integration/helpers.ts`

**Interfaces:**
- Produces the Prisma models and fields in the design's Data model table, with these additions
  that the design leaves to the builder:
  - `CartItem` (`buyerId`, `variantId`, `qty`, unique pair). It holds no stock.
  - `Order.paymentAttemptId?`. `OrderLine.courierEach`, `OrderLine.agentFeeEach` and
    `OrderLine.missingQty` (default 0) are snapshots.
  - `Agent.status` adds `LEAVING`. `Agent` adds `lossAmount` (default 0), `lossNote` and
    `suspendedAt`.
  - `AgentLoss` (`agentId`, `amount`, `reason`, `photoKeys String[]`, `decidedById`, `createdAt`).
  - `PickupAttempt` (`agentId`, `at`, `ok`) for code-box blocking.
  - `ReturnRequest` adds nullable `orderLineId`, `handoverAgentId`, `handoverDueAt`,
    `handedOverAt` and `sentBackBasketId`; `cartLineId` becomes nullable. `ReturnStatus` adds
    `AWAITING_HANDOVER`, `HANDED_OVER` and `LAPSED`.
  - `PayoutDeduction` has `factoryId`, `kind`, `amount`, `ref` (unique with `kind`) and nullable
    `payoutId`, so deductions can wait for the next payout.
  - `PaymentAttempt` adds `agentId?` for deposits.
- Role and area enums are **not** changed here (Task 13).
- `helpers.ts`: `resetDb()` creates `Settings` with defaults only, without `accountNumber`. Add
  `makeFactory()` returning `{ factory, variant }`: a `SELLER` user with a `FactoryProfile` and a
  LIVE product with `factoryPrice` 1000, `commission` 100, `price` 1100 and a variant with 50
  available. Add `makeAgent({ lat, lng, status = "LIVE" })`, `makeBuyer({ lat, lng })` and
  `fundTokens(userId, amount)`, which writes one `ORDER_CANCEL` entry with eventKey
  `test:<cuid>`.

- [ ] **Step 1:** Edit the schema, run `npm run db:start`, then
      `npx prisma migrate dev --name agent_model`. Expected: the migration applies and the client
      is regenerated.
- [ ] **Step 2:** Add the partial unique index by hand in the migration SQL:
      `CREATE UNIQUE INDEX "Basket_one_open" ON "Basket"("agentId","factoryId") WHERE status = 'OPEN';`
      Re-run `npx prisma migrate reset --force`.
      Expected: the reset succeeds.
- [ ] **Step 3:** `npm run typecheck && npm run test:int`. Expected: the existing suite is still
      green, because old tables are untouched.
- [ ] **Step 4:** Commit `prisma/` and `tests/integration/helpers.ts`: "Add agent model schema".

### Task 2: Pure money rules

**Files:** Create `src/lib/agent-money.ts`, `src/lib/agent-money.test.ts` and
`src/lib/agent-money.property.test.ts`.

**Interfaces (produces):**
```ts
type Rates = { courierPerItem: D; agentFeePerItem: D; gatewayFeeRate: D };
type LineIn = { qty: number; unitPrice: D };
type OrderTotals = { items: D; courier: D; agentFee: D; gross: D };
export function orderTotals(lines: LineIn[], r: Rates): OrderTotals;
export function gatewayFee(remainder: D, rate: D): D;
/** Tokens fill orders in the given order; fee split by remainder share, last order takes the rounding cent. */
export function splitCheckout(orders: OrderTotals[], tokens: D, rate: D):
  { tokens: D; remainder: D; fee: D; due: D }[];
export function cancelRefund(o: { tokensApplied: D; remainder: D; fee: D }): D;
export function returnRefund(qty: number, unitPrice: D, courierEach: D, fault: "FACTORY" | "BUYER"): D;
export function missingRefund(qty: number, unitPrice: D, courierEach: D, agentFeeEach: D): D;
export function missingDeduction(qty: number, unitPrice: D, factoryPrice: D, courierEach: D, agentFeeEach: D): D;
export function lineEarning(qty: number, returnedQty: number, missingQty: number, factoryPrice: D): D;
```

- [ ] **Step 1: Write failing tests** in `agent-money.test.ts`:
  - `orderTotals([{qty:1,unitPrice:1000}], {40,20,0.033}).gross` equals `1060.00`.
  - `gatewayFee(1060, 0.033)` equals `36.17`; `gatewayFee(0, 0.033)` equals `0`;
    `gatewayFee(760, 0.033)` equals `25.94` (the 300-token example).
  - `splitCheckout` with two orders of 1060 and 530 and 0 tokens gives fees that add up to
    `gatewayFee(1590)` = `54.26`, and the last order takes the rounding cent.
  - `splitCheckout` with tokens 1200 gives the first order tokens 1060 and remainder 0, and the
    second order tokens 140.
  - `returnRefund(1,1100,40,"FACTORY")` = `1100`; `returnRefund(1,1100,40,"BUYER")` = `1060`.
  - `missingRefund(1,1100,40,20)` = `1160`; `missingDeduction(1,1100,1000,40,20)` = `160`.
  - `lineEarning(3,1,0,1000)` = `2000`.
- [ ] **Step 2:** `npx vitest run --project unit src/lib/agent-money.test.ts`. Expected: FAIL
      (module missing).
- [ ] **Step 3:** Implement. Use `roundMoney` only on the fee and the final per-order values.
- [ ] **Step 4: Property test:** for random carts (1–5 orders, qty 1–20, prices 1–50,000.00, tokens
      0 up to the gross), check that Σ(tokens + remainder) = Σgross exactly; Σfee =
      `gatewayFee(Σremainder)`; every value has at most 2 decimals; and remainder ≥ 0. Use the
      existing property-test style in `src/lib/cart-money.property.test.ts`.
- [ ] **Step 5:** Run both files. Expected: PASS. Commit: "Add agent money rules".

### Task 3: Area, hours, week and status rules

**Files:** Create `src/lib/agent-rules.ts`, `src/lib/order-rules.ts` and their `.test.ts` files.
Modify `src/lib/return-rules.ts` and its test.

**Interfaces (produces):**
```ts
export function clashesWith(pin: Point, others: Point[], gapM: number): boolean;      // uses distanceKm
export function nearestAgents<T extends Point>(buyer: Point | null, agents: T[]): (T & { distanceKm: number | null })[];
export type Hours = { weekday: number; opensAt: number; closesAt: number }[];
export function openNow(hours: Hours, now: Date): boolean;                         // Asia/Colombo
export function weekEnding(now: Date): Date;   // last Sat 23:59:59.999 +05:30 that is <= now
export function isPickupCode(s: string): boolean;                                  // /^\d{6}$/
export const ORDER_MOVES: Record<OrderStatus, OrderStatus[]>;
export const BASKET_MOVES: Record<BasketStatus, BasketStatus[]>;
export function canMoveOrder(a, b): boolean; export function canMoveBasket(a, b): boolean;
```
`return-rules.ts`: `canMoveReturn` adds `ACCEPTED→AWAITING_HANDOVER`, `AWAITING_HANDOVER→HANDED_OVER | LAPSED` and `HANDED_OVER→PICKED_UP→RECEIVED→COMPLETED`.

- [ ] **Step 1: Failing tests:**
  - `clashesWith` is true at 1,999 m and false at 2,001 m.
  - `weekEnding(2026-11-08T02:00+05:30)` = 2026-11-07T23:59:59.999+05:30, and
    `weekEnding(2026-11-07T23:59:59+05:30)` = 2026-10-31T23:59:59.999+05:30.
  - `openNow` with Monday 09:00–17:00 is true at Monday 16:59 Colombo and false at 17:00.
  - `nearestAgents(null, …)` keeps the given order with `distanceKm` null.
  - `canMoveBasket("OPEN","PACKED")` is false.
  - `canMoveReturn("AWAITING_HANDOVER","LAPSED")` is true.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
      Commit: "Add agent area, week and status rules".

### Task 4: Ledger for orders and transfers

**Files:** Modify `src/server/tokens.ts`. Create `src/server/orders/locks.ts` and
`tests/integration/token-transfer.int.test.ts`.

**Interfaces:**
- `orders/locks.ts`:
  - `withOrderTransaction<T>(userIds: string[], orderIds: string[], work: (tx) => Promise<T>)`
    takes the lock order from Global Constraints and retries on P2034, up to 8 times.
  - `lockBasketSlot(tx, agentId, factoryId)` takes the advisory lock.
  - `lockLedgerUsers` and `lockUserAdvisory` are re-exported from here; `carts/locks.ts` imports
    them from here until Task 18.
- `tokens.ts` adds:
  ```ts
  export async function post(tx: Tx, e: { userId: string; amount: D; kind: TokenKind; eventKey: string;
    note: string; orderId?: string; orderLineId?: string; returnId?: string; counterpartyId?: string }): Promise<"created" | "exists">;
  export async function assertTokenHolder(tx: Tx, userId: string): Promise<void>; // throws TokenError for SELLER role or any user with factoryId
  export async function transferTokens(fromId: string, toPhoneOrEmail: string, amount: string, requestKey: string): Promise<void>;
  ```
  - `post` locks the ledger user. If the event key exists with the same user and amount it
    returns "exists"; if it differs it throws. A negative amount is refused when it would take the
    balance below 0.
  - `transferTokens` writes `TRANSFER_OUT` (−) with eventKey `xfer:<requestKey>:out` and
    `TRANSFER_IN` (+) with eventKey `xfer:<requestKey>:in`.
  - The existing `credit` is kept and delegates to `post`.

- [ ] **Step 1: Failing tests:**
  - **transfer moves balance:** A has 500 and sends 200, so A has 300 and B has 200.
  - **same request key twice:** only one transfer happens.
  - **refused:** sending to self; to a factory account or factory staff; 0, −5, `1.005` or more
    than the balance. Each throws `TokenError` and nothing is written.
  - **race:** A has 100; two parallel `transferTokens` of 80 with different keys. Exactly one
    succeeds and the balance is 20.
  - **factory cannot send:** a factory account given a test entry directly is still refused.
- [ ] **Step 2:** `npx vitest run --project integration tests/integration/token-transfer.int.test.ts`.
      Expected: FAIL.
- [ ] **Step 3:** Implement. **Step 4:** Run the file and then `tests/integration/tokens.int.test.ts`.
      Expected: PASS. Commit: "Add order lock order and token transfers".

### Task 5: Gateway adapter and demo gateway

**Files:**
- Create `src/server/payments/gateway.ts`, `src/server/payments/demo.ts`,
  `src/app/demo-pay/[attemptId]/page.tsx` and `src/app/demo-pay/[attemptId]/actions.ts`.
- Create `src/server/payments/demo.test.ts` (unit; it imports only pure signing helpers).
- Modify `.env.example`.

**Interfaces:**
- The `Gateway` interface is as in the design. `getGateway(): Gateway` throws unless
  `PAYMENT_GATEWAY=demo` (PayHere comes later).
- Notice format (PayHere's): form fields `merchant_id`, `order_id` (= attemptId), `payment_id`,
  `payhere_amount` (2 dp), `payhere_currency` (`LKR`), `status_code` (`2` paid, `0` pending, `-1`
  cancelled, `-2` failed) and `md5sig`.
  - `md5sig = UPPER(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + UPPER(md5(secret))))`.
  - `eventId = payment_id + ":" + status_code`.
- `demo.ts` exports `signNotice(fields, secret): string` and `verifyNotice(raw, headers)`.
  `verifyNotice` uses `timingSafeEqual` and returns null on a bad signature or an unknown merchant.
- Env: `PAYMENT_GATEWAY=demo`, `DEMO_MERCHANT_ID=1200000`, `DEMO_MERCHANT_SECRET=CHANGE_ME`.
- Demo page: it shows the amount and has three buttons, Pay, Fail and Cancel. The server action
  POSTs a signed notice to `appUrl("/api/payments/notify")` and then redirects to the return URL
  `/checkout/return/[attemptId]`. If `PAYMENT_GATEWAY` is not `demo`, it returns 404.

- [ ] **Step 1: Failing unit tests:**
  - **signature round-trip:** `verifyNotice` of a `signNotice` body returns the fields.
  - **tampered amount:** returns null.
  - **wrong merchant_id:** returns null.
  - **lowercase signature:** still accepted.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
      Commit: "Add gateway adapter and demo gateway".

### Task 6: Buyer cart and checkout

**Files:** Create `src/server/orders/cart.ts`, `src/server/orders/checkout.ts` and
`tests/integration/checkout.int.test.ts`.

**Interfaces:**
```ts
// cart.ts — no stock held
export async function setCartItem(buyerId: string, variantId: string, qty: number): Promise<void>; // qty 0 removes
export async function cartView(buyerId: string): Promise<{ factories: { factoryId; name; lines; totals: OrderTotals }[] }>;
// checkout.ts
export async function quoteCheckout(buyerId: string, agentId: string, tokens: string): Promise<ReturnType<typeof splitCheckout> & { orders: OrderTotals[] }>;
export async function startCheckout(buyerId: string, input: { agentId: string; tokens: string; requestKey: string }):
  Promise<{ attemptId: string | null; redirectUrl: string | null; orderIds: string[] }>;
export class CheckoutError extends CartError {}
```
Inside one `withOrderTransaction([buyerId], [])`, `startCheckout` does the following:
1. Checks the agent is `LIVE`.
2. Checks the buyer is a token holder.
3. Snapshots the prices `unitPrice` and `factoryPrice` and the Settings `courierEach` and
   `agentFeeEach`.
4. Reserves stock for each line with `updateMany where available >= qty`
   (`available -= qty, reserved += qty`). If any line falls short, it throws "Only N left of …".
5. Creates one `PENDING` order per factory with `holdUntil = now + paymentHoldMinutes`.
6. Posts one `HOLD` entry per order (eventKey `hold:<orderId>`).
7. If the total due is 0, it marks the orders paid through the shared `markOrdersPaid` (Task 7)
   in the same transaction.
8. Otherwise it creates one `PaymentAttempt` with `purpose ORDERS`, the amount Σdue and
   `expiresAt = holdUntil`.
9. Clears the cart.

The same `requestKey` returns the first result. `createCheckout` is called after commit.

- [ ] **Step 1: Failing tests:**
  - **reserves stock:** 2 of 50, so available is 48 and reserved is 2.
  - **amounts:** a 1100 item with no tokens is due 1,199.59 (fee 39.59 = `1160 / 0.967 − 1160`
    rounded).
  - **two factories:** gives two orders, one attempt and one fee.
  - **tokens cover all:** no attempt, both orders are `PAID` and joined to baskets.
  - **short stock:** throws, and nothing is reserved.
  - **suspended agent:** refused.
  - **factory staff:** cannot check out with tokens.
  - **repeat requestKey:** no second order.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
      Commit: "Add buyer cart and checkout".

### Task 7: Payment notice, basket fill and lock, cancel before lock

**Files:**
- Create `src/server/payments/notice.ts`, `src/server/orders/baskets.ts`,
  `src/app/api/payments/notify/route.ts` and `src/app/checkout/return/[attemptId]/page.tsx`.
- Create `tests/integration/payments.int.test.ts` and `tests/integration/baskets.int.test.ts`.

**Interfaces:**
```ts
// baskets.ts
export async function markOrdersPaid(tx: Tx, orderIds: string[], now: Date): Promise<string[]>; // returns locked basket ids
export async function lockBasket(tx: Tx, basketId: string, reason: "AMOUNT" | "MAX_WAIT" | "SUSPENDED", now: Date): Promise<void>;
export async function cancelOrder(buyerId: string, orderId: string): Promise<void>;
export async function expireOrders(now: Date): Promise<number>;
// notice.ts
export async function handleNotice(raw: string, headers: Headers): Promise<{ status: 200 | 400 }>;
```
- **`markOrdersPaid`**, for each order:
  - move stock `reserved → sold`;
  - post a zero `SPEND` (`spend:<orderId>`);
  - take `lockBasketSlot`, then find or create the `OPEN` basket and set `firstOrderAt` if it is
    null;
  - add `itemsTotal`, attach the order and set `paidAt`;
  - if the total reaches `basketLockAmount`, call `lockBasket(AMOUNT)`, which sets `lockedAt`. The
    next order creates a new `OPEN` basket.
- **`handleNotice`:**
  1. Verify the raw body. A bad signature returns 400 with nothing recorded.
  2. Insert `PaymentEvent` (a duplicate `gateway+eventId` returns 200 with nothing done).
  3. Status `2`: check the amount and currency equal the attempt's; a mismatch records the event,
     marks it FAILED and returns 200. If the attempt is `PENDING` and every order is `PENDING`,
     `markOrdersPaid`. Otherwise mark it `LATE_PAID` and post one `LATE_PAYMENT` credit for the
     amount (`late:<attemptId>`) to the buyer, or to the agent for a deposit.
  4. Status `-1` or `-2`: mark the attempt FAILED and cancel its pending orders, releasing stock
     and tokens.
  5. Deposit attempts call `agentDepositPaid` (Task 11). Until then this throws "not built".
- **`cancelOrder`:** only when the order is `PAID` and its basket is `OPEN`. It does the following:
  - `sold → available`;
  - lowers the basket total;
  - moves `firstOrderAt` to the earliest remaining paid order, or null if none is left;
  - credits `cancelRefund` as `ORDER_CANCEL` (`cancel:<orderId>`);
  - sets the order `CANCELLED`.
- **`expireOrders`:** handles `PENDING` orders past `holdUntil`. It releases stock, posts the
  `RELEASE` of the hold, and marks the orders `CANCELLED` and the attempt `EXPIRED`.
- **Route:** `POST` reads `await req.text()` and calls `handleNotice`. The return page shows
  Paid, Not paid or Checking, and while Checking it calls `fetchStatus` once.

- [ ] **Step 1: Failing tests** (`payments.int.test.ts`):
  - **paid notice:** the order is PAID, stock is sold and the basket total is 1100.
  - **duplicate event:** no change.
  - **forged signature:** 400, with no event recorded.
  - **amount mismatch:** the order stays PENDING.
  - **failed notice:** stock and tokens are released.
  - **late notice after expire, posted 3 times:** one `LATE_PAYMENT` equal to the attempt amount,
    and the orders stay CANCELLED (Review Focus 1).
- [ ] **Step 2: Failing tests** (`baskets.int.test.ts`):
  - **lock at 50,000:** 46 orders of 1100 lock the basket on the 46th (total 50,600), and the 47th
    opens a new basket.
  - **concurrent crossing:** `Promise.all` of two notices that each cross the limit. Exactly one
    basket is LOCKED, one is OPEN, and their totals add up to the sum (Review Focus 2).
  - **cancel before lock:** full tokens, the total goes down, and `firstOrderAt` moves.
  - **cancel the only order:** `firstOrderAt` becomes null.
  - **cancel after lock:** refused.
  - **expire:** after 15 minutes the stock is back and the hold is released.
- [ ] **Step 3:** Run both. Expected: FAIL. **Step 4:** Implement. **Step 5:** Run them and
      `npm run test`. Expected: PASS. Commit: "Add payment notices, basket fill and cancel".

### Task 8: Packing, courier booking, missing items, receipt

**Files:** Create `src/server/orders/delivery.ts` and `tests/integration/delivery.int.test.ts`.

**Interfaces:**
```ts
export async function markPacked(userId: string, basketId: string): Promise<void>;          // factory OWNER/PACKING of that factory; LOCKED→PACKED
export async function reportMissing(userId: string, orderLineId: string, qty: number, note: string): Promise<void>; // factory, LOCKED or PACKED only; sets a pending report
export async function removeMissingLine(adminId: string, orderLineId: string): Promise<void>; // FACTORY admin
export async function bookCourier(adminId: string, basketId: string, c: { fee: string; driverName: string; driverPhone: string; vehicleNo: string }): Promise<void>; // AGENTS admin; PACKED only
export async function givenToDriver(userId: string, basketId: string): Promise<void>;       // factory OWNER/PACKING; needs booking; →WITH_COURIER
export async function markBasketReceived(agentUserId: string, basketId: string, sentBackReturnIds: string[]): Promise<void>;
```
- **`removeMissingLine`:**
  - `missingQty += qty`;
  - credits `missingRefund` as `MISSING_ITEM` (`missing:<lineId>`);
  - creates a `PayoutDeduction` of kind `MISSING_ITEM` for `missingDeduction`
    (ref `missing:<lineId>`);
  - lowers the basket total;
  - sets line status `CANCELLED` when `missingQty = qty`.
- **`markBasketReceived`** (by the basket's agent, from WITH_COURIER):
  - sets the basket `AT_AGENT`, its paid orders `RECEIVED`, and `receivedAt`;
  - credits `COURIER_REPAY` for the booked fee (`courier:<basketId>`);
  - creates a `PickupCode` (buyer, agent) if missing, with 6 random digits from
    `crypto.randomInt` and a retry on a unique clash;
  - sets the listed `HANDED_OVER` returns for that factory to `PICKED_UP` with
    `sentBackBasketId`;
  - after commit, notifies each buyer: "Ready to collect" with the code, the agent and a link to
    `/`.
- The design states the agent fee is credited weekly (Task 12), not here.

- [ ] **Step 1: Failing tests:**
  - **full path:** LOCKED → PACKED → book → WITH_COURIER → AT_AGENT. The courier fee is credited
    once even if `markBasketReceived` is called twice. The buyer gets one notice with a 6-digit
    code, and a second order received later for the same buyer and agent keeps the same code.
  - **wrong factory:** cannot pack.
  - **cannot book before PACKED.**
  - **other agent:** cannot mark received.
  - **missing item:** the buyer gets 1160 tokens, a deduction of 160 is waiting, and the basket
    total goes down.
  - **sales staff:** cannot mark packed.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
      Commit: "Add packing, courier booking, missing items and receipt".

### Task 9: Returns on order lines with agent handover

**Files:** Modify `src/server/returns.ts`, `src/server/fault-holds.ts` (refs only),
`src/server/quality.ts`, `src/server/ratings.ts` and `tests/integration/returns.int.test.ts`
(rewrite).

**Interfaces:**
- `fileReturn(buyerId, orderLineId, input)`:
  - allowed only when the line is collected, `now ≤ order.receivedAt + collectHours`, and
    qty ≤ qty − returned − missing − open returns;
  - photos and reasons stay as they are;
  - `factoryDueAt` = now + 24h, as before.
- `factoryDecide` and `adminDecide`: accepting goes straight to `AWAITING_HANDOVER`, with
  `handoverAgentId = order.agentId` and `handoverDueAt = now + returnHandoverDays`. The buyer
  is notified with the agent's name and address.
- New: `collectReturn(agentUserId, returnId)`. It works only for the handover agent and only from
  `AWAITING_HANDOVER`, and does the following:
  - set the status to `HANDED_OVER` and record `handedOverAt`;
  - add the quantity to `returnedQty`;
  - credit `returnRefund` as `RETURN` (`credit:RETURN:<id>`);
  - for a factory fault: call `recordFault` and add a `PayoutDeduction` of kind
    `RETURN_COURIER` for qty × `courierEach` (ref `retcourier:<id>`).
- New: `lapseReturns(now)`. Returns in `AWAITING_HANDOVER` past `handoverDueAt` become `LAPSED`,
  and the line becomes earnable again.
- The factory's `markReceived` now works from `PICKED_UP`. It is kept as it is, with an option to
  put stock back: `restock: boolean` adds the quantity to `available`.
- Removed: `bookReturnPickup` and `markReturnPickedUp`, because returns ride back with the next
  courier.
- `ProductRating.cartId` → `orderId`, the same for quality reports. Ratings are allowed after
  collection.

- [ ] **Step 1: Failing tests:**
  - **48h window:** a return filed at hour 47 works; one filed at hour 49 is refused.
  - **not collected:** refused.
  - **factory fault:** accept → collect gives 1100 tokens, records a fault and adds a deduction of
    40.
  - **buyer fault:** 1060 tokens and no deduction.
  - **escalation:** after 24h the return goes to admin, and when admin accepts it moves to
    `AWAITING_HANDOVER`.
  - **lapse:** after 7 days the return is `LAPSED` and no tokens are given.
  - **wrong agent:** cannot collect.
  - **send back:** goes PICKED_UP and then the factory receives it with restock.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run `returns`,
      `fault-holds`, `quality` and `ratings` integration files. Expected: PASS. Commit: "Move
      returns to order lines with agent handover".

### Task 10: Pickup by code

**Files:** Create `src/server/orders/handover.ts` and `tests/integration/handover.int.test.ts`.

**Interfaces:**
```ts
export async function lookupCode(agentUserId: string, code: string): Promise<
  { buyerName: string; lines: { id: string; title: string; size: string; colour: string; qty: number }[] } | null>;
export async function handOver(agentUserId: string, code: string, lineIds: string[]): Promise<number>;
export class PickupBlocked extends CartError {}
```
- The lookup shows only that agent's `RECEIVED` orders whose lines are uncollected and whose
  quantity left (qty − missing) is above 0.
- Each lookup records a `PickupAttempt`. After 5 failed attempts in 10 minutes, `lookupCode` throws
  `PickupBlocked` for 10 minutes.
- `handOver` sets `collectedAt` on the given lines, which must all belong to that code's lookup.

- [ ] **Step 1: Failing tests:**
  - **right code:** shows 2 lines, and after hand over the lookup is empty.
  - **another agent's code:** null.
  - **6 wrong codes:** blocked (Review Focus 4).
  - **line id from another buyer:** refused, and nothing changes.
- [ ] **Step 2–4:** fail → implement → pass. Commit: "Add pickup by code".

### Task 11: Agents: apply, approve, deposit, hours, suspend, leave, losses

**Files:** Create `src/server/agents/apply.ts`, `src/server/agents/admin.ts`,
`src/server/agents/hours.ts` and `tests/integration/agents.int.test.ts`.

**Interfaces:**
```ts
export async function applyAsAgent(userId: string, fd: FormData): Promise<void>;     // NIC, own photo, storage photos via saveUpload(IMAGE_TYPES); address+pin; status APPLIED
export async function decideAgent(adminId: string, agentId: string, approve: boolean, note: string): Promise<void>; // AGENTS admin; approve refuses if clashesWith(LIVE/APPROVED/SUSPENDED/LEAVING, agentGapM)
export async function startDeposit(agentUserId: string): Promise<{ redirectUrl: string }>; // APPROVED only; attempt purpose DEPOSIT, amount agentDeposit + gatewayFee(agentDeposit)
export async function agentDepositPaid(tx: Tx, attemptId: string): Promise<void>;     // APPROVED→LIVE, depositPaidAt, user.role = AGENT
export async function setHours(agentUserId: string, hours: Hours): Promise<void>;
export async function suspendAgent(adminId: string, agentId: string, reason: string): Promise<void>; // locks OPEN baskets (SUSPENDED)
export async function liftSuspension(adminId: string, agentId: string): Promise<void>;
export async function requestLeave(agentUserId: string): Promise<void>;               // LIVE/SUSPENDED→LEAVING, locks OPEN baskets
export async function recordLoss(adminId: string, agentId: string, amount: string, reason: string, photos: File[]): Promise<void>;
export async function closeLeavingAgents(now: Date): Promise<number>;                // LEAVING with no uncollected lines, no baskets before AT_AGENT, no AWAITING_HANDOVER/HANDED_OVER returns → LEFT + DEPOSIT_RETURN (deposit − losses, if > 0)
```
- `nearestAgents` for checkout uses only `LIVE` agents.
- Core admin reviews disputes in the UI only, so there is no extra service.

- [ ] **Step 1: Failing tests:**
  - **clash:** approving one 1.5 km from a live agent is refused.
  - **deposit:** a paid notice for a deposit sets LIVE and role AGENT; a late deposit credits
    `LATE_PAYMENT` to the agent.
  - **suspend:** locks OPEN baskets, and checkout to the agent is refused. Lifting the suspension
    makes the agent LIVE again.
  - **leave:** with a waiting parcel the agent stays LEAVING; after hand over,
    `closeLeavingAgents` makes them LEFT with 200,000 − losses in tokens, credited once.
  - **only AGENTS admin:** can decide.
- [ ] **Step 2–4:** fail → implement → pass. Commit: "Add agent onboarding, deposit, suspension
      and leaving".

### Task 12: Weekly payouts, agent fees and the sweep

**Files:** Create `src/server/payouts/index.ts`, `src/server/sweep.ts` and
`tests/integration/payouts.int.test.ts`. Modify `src/app/api/cron/sweep/route.ts`.

**Interfaces:**
```ts
export async function buildWeeklyPayouts(now: Date): Promise<number>;  // for weekEnding(now) not yet built
export async function creditAgentFees(now: Date): Promise<number>;     // eventKey agentfee:<agentId>:<weekEnding ISO>
export async function markPayoutPaid(adminId: string, payoutId: string, bankRef: string): Promise<void>; // CORE admin
export async function runSweep(now = new Date()): Promise<Record<string, number>>;
```
- **Payout:** one `FactoryPayout` per factory per `weekEnding`, unique
  (`factoryId`, `weekEnding`). It is built from the following:
  - **Items:** each line whose order has `receivedAt + collectHours ≤ weekEnding`, that is in no
    `PayoutItem`, and that has no return in an open status (WAITING_FACTORY, WITH_ADMIN, ACCEPTED,
    AWAITING_HANDOVER). Each item's amount is `lineEarning`.
  - **Deductions:** every `PayoutDeduction` with a null `payoutId` and `createdAt ≤ weekEnding`.
  - **Net:** `net = max(0, gross − deductions)`. If deductions are larger, create a carry
    `PayoutDeduction` (kind as the largest one, ref `carry:<payoutId>`) for the difference.
- **Agent fees:** Σ qty − missing × `agentFeeEach` over lines in baskets that reached `AT_AGENT`
  within that week.
- **`runSweep`** runs each step in its own transaction:
  - `expireOrders`;
  - lock baskets where `firstOrderAt + maxWaitDays ≤ now` (`MAX_WAIT`);
  - `escalateOverdue`;
  - `lapseReturns`;
  - `closeLeavingAgents`;
  - if `weekEnding(now) > last built`, `buildWeeklyPayouts` and `creditAgentFees`;
  - flush brand and return notices.
- **Route:** it keeps the secret check and calls `runSweep`. Page loads never sweep: remove the
  sweep calls from pages in Task 18.

- [ ] **Step 1: Failing tests:**
  - **earnings:** a line received Thursday 10:00 and the sweep on Sunday 01:00 gives an item of
    1000. A line received Saturday 20:00 is not paid until the next week.
  - **open return:** holds the line; once it lapses, the line is paid the next week.
  - **deductions bigger than gross:** net 0 and a carry for the rest (Review Focus 3).
  - **idempotent:** running the sweep twice gives one payout and one agent fee credit.
  - **max wait:** a basket 61 days old locks with `MAX_WAIT`.
  - **only CORE:** can mark a payout paid.
- [ ] **Step 2–4:** fail → implement → pass. Commit: "Add weekly payouts, agent fees and sweep".

### Task 13: Roles and admin areas

**Files:**
- Modify `prisma/schema.prisma` (new migration `agent_roles`), `src/lib/factory-roles.ts`,
  `src/lib/admin-access.ts`, `src/server/auth/session.ts` and every reference that
  `npm run typecheck` reports.
- Create `tests/integration/agent-access.int.test.ts`.

**Interfaces:**
- `Role`: add `AGENT` and remove `PACKER`.
- `FactoryRole`: remove `PLANNER`. Migration: `UPDATE "User" SET "factoryRole"='SALES' WHERE "factoryRole"='PLANNER'` before the enum swap.
- `AdminArea`: rename `WAREHOUSE` to `AGENTS` (`ALTER TYPE ... RENAME VALUE`).
- `ADMIN_AREA_LABEL.AGENTS = "Agents and orders"`.
- `SECTIONS`:
  - OWNER: home, orders, products, insights, team, returns, earnings.
  - PACKING: home, orders.
  - SALES: home, products, insights, returns, baskets.
  - `FactorySection` adds "earnings" and "baskets".
- `requireAgent()`: role `AGENT` with a `LIVE`, `SUSPENDED` or `LEAVING` agent row. A suspended
  agent still sees parcels and returns.
- Buyers are `CUSTOMER` or `AGENT`.

- [ ] **Step 1: Failing tests:**
  - an agent cannot see another agent's baskets, codes or returns;
  - a buyer cannot call agent, factory or admin services;
  - Packing cannot see earnings;
  - a FACTORY admin cannot book couriers;
  - an AGENTS admin cannot mark payouts paid.
- [ ] **Step 2–4:** fail → implement (the migration, then fix the typecheck errors) → pass, plus
      `npm run test:int`. Commit: "Add agent role and rename admin areas".

### Task 14: Buyer screens

**Files:**
- Modify `src/app/page.tsx` and `src/app/shop`, `src/app/products/[id]`.
- Create `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/orders/page.tsx`,
  `src/app/orders/[id]/page.tsx`, `src/app/tokens/page.tsx` and actions files next to each.
- Create `tests/e2e/buyer.spec.ts`.

**Contents** (most important first; layouts are in the brief memlog, and the approved buyer home
order is the following):
- **Home:**
  - Ready to collect: the code in large digits, the agent name, open now or closed, the hours, and
    a map link `https://maps.google.com/?q=lat,lng`.
  - Return to hand over: the agent, and the due date.
  - My orders: with basket progress shown as total / 50,000, and Share basket, which copies a
    `/products/[id]?agent=<id>` link.
  - Tokens.
  - Shop.
- **Checkout:**
  - The agent picker first, with the nearest selected and its distance shown.
  - Then the lines Item, Courier, Agent fee, Tokens, PayHere fee and Total, from `quoteCheckout`.
  - Then the Pay button, which calls `startCheckout` and redirects.
- **Orders/[id]:** the lines with status Paid, Cancelled, Received or Collected; Cancel when the
  basket is OPEN; File return within the window.
- **Tokens:** the balance, the history, and a Send form (phone or email, amount).
- Read `node_modules/next/dist/docs/01-app` for server actions, `redirect` and `searchParams`
  before writing.

- [ ] **Step 1:** Write `buyer.spec.ts` (mobile project, 360×740). Sign in as the seeded buyer,
      add an item, check out with the default agent, pay on the demo page, and see "Paid" and basket
      progress. Run axe, which must show no violations. Expected: FAIL.
- [ ] **Step 2:** Build the pages. **Step 3:** `npm run e2e:mobile -- buyer`. Expected: PASS.
      Commit: "Add buyer screens".

### Task 15: Agent screens

**Files:** Create `src/app/agent/{page,pickups/page,returns/page,tokens/page,hours/page}.tsx`,
`src/app/agents/apply/page.tsx`, the actions files, and `tests/e2e/agent.spec.ts`.

**Contents:**
- **Home:**
  - Hand over code box first. Typing the code shows the items and a Hand over button.
  - Arriving today: WITH_COURIER baskets, with the driver, phone, vehicle and fee, and Mark
    received with checkboxes for the returns to send back.
  - Waiting for pickup: count and list.
  - Returns to collect.
  - Open baskets: each factory with total / 50,000.
  - Tokens.
- **Apply:** NIC, own photo, storage photos, address and map pin.
- **Pay deposit:** shown when APPROVED.
- **Leave:** a button with a confirm step.

- [ ] **Step 1:** Write the spec as the seeded agent:
  - mark a WITH_COURIER basket received;
  - type the seeded buyer's code and hand over;
  - collect a return;
  - axe check.

  Expected: FAIL.
- [ ] **Step 2:** Build. **Step 3:** Run it. Expected: PASS. Commit: "Add agent screens".

### Task 16: Factory screens

**Files:** Modify `src/app/seller/(workspace)/{page,layout}.tsx`,
`src/app/seller/(workspace)/orders`, `src/app/seller/returns` and `src/server/factory-dashboard.ts`.
Create `src/app/seller/(workspace)/baskets/page.tsx` and
`src/app/seller/(workspace)/earnings/page.tsx`. Update `tests/e2e/factory.spec.ts`.

**Contents:**
- **Packing home:**
  - To pack: LOCKED baskets with lines grouped by product, size and colour, a Report missing
    button for each line, and Mark packed.
  - Courier booked: the driver details and Given to driver.
- **Sales home:** Filling baskets (OPEN baskets with agent area and total), Returns, Products and
  stock.
- **Owner home:** everything above, plus Earnings and payouts (this week's earned amount, the next
  Sunday, and past payouts with deductions).
- Order stages are labelled Filling, Locked, Packed, With courier and At agent.
- Old cart-based widgets in `factory-dashboard.ts` are replaced by basket queries.

- [ ] **Step 1:** Update the spec:
  - Packing marks packed and given to driver;
  - Owner sees an earning after the sweep runs;
  - Sales cannot open earnings.

  Expected: FAIL.
- [ ] **Step 2:** Build. **Step 3:** Run it. Expected: PASS. Commit: "Adapt factory screens to
      baskets".

### Task 17: Admin screens

**Files:**
- Create `src/app/admin/agents/{page,applications,deposits,baskets,search}` and
  `src/app/admin/core/{payouts,tokens}`.
- Modify `src/app/admin/factory` (add Missing items), `src/app/admin/settings` (new fields; bank
  fields removed), `src/app/admin/layout.tsx` and `src/lib/admin-access.ts`
  `adminHome("AGENTS") = "/admin/agents"`.
- Replace `tests/e2e/admin-workspaces.spec.ts`.

**Contents:**
- **Agents and orders:**
  - Courier to book: PACKED baskets, with a form for fee, driver, phone and vehicle.
  - Payment problems: LATE_PAID and mismatched events.
  - Applications: with the photos, a map pin, and a clash warning.
  - Deposits and losses: record a loss.
  - 2-month baskets: OPEN baskets oldest first, with their days.
  - Search: by order, code, phone or basket.
- **Factory:** returns, missing items (remove the line), fault holds, applications and quality.
- **Core:** payouts (the draft list, Mark paid with the bank ref), Tokens (look up a user's
  balance and history), Settings and Admins.

- [ ] **Step 1:** Write a spec for each area's first action:
  - book a courier;
  - remove a missing line;
  - mark a payout paid;
  - each area gets 403 or a redirect when opening another area.

  Expected: FAIL.
- [ ] **Step 2:** Build. **Step 3:** Run it. Expected: PASS. Commit: "Add admin agent, factory and
      core screens".

### Task 18: Seed and removal of the old system

**Files:**
- Rewrite `prisma/seed.ts` and `tests/e2e/seed-fixtures.ts`.
- Delete:
  - `src/server/carts/*` except the error class, moved to `src/server/errors.ts` as `AppError`,
    with `CartError` kept as an alias until all imports change;
  - `src/server/{lots,lot-actions,prices,offers,samples,sample-actions,packing,packing-actions,receiving,orders,factory-orders,factory-order-actions,stock}.ts`
    where they serve only removed features (check imports first);
  - `src/app/{c,carts,my-carts,packing,samples,messages}`;
  - `src/app/admin/{carts,slips,lots,offers,packing,warehouse,orders,deliveries}`;
  - `src/app/api/{slips,chat,admin/carts,sales}`;
  - the matching tests in `tests/integration` and `tests/e2e`.
- Gifts: remove the cart links; hide the gift routes.
- Delivery provider files (`src/server/delivery`, `api/webhooks/pickme`): remove them, because
  admin books couriers by hand.
- New migration `remove_group_carts`. It drops the following:
  - the tables `GroupCart`, `CartMember`, `CartLine`, `PaymentSlip`, `CartMergeRequest`,
    `CartInvite`, `Packing`, `Lot`, `PriceChange`, `StockOffer`, `SampleRequest`, `CartMessage`
    and `Delivery`;
  - the old enums and the `ReturnRequest.cartLineId` / pickup columns;
  - the Settings fields `minOrderValue`, `cartLifetimeHours`, `slipWindowHours`, bank fields and
    lot margins;
  - `TokenKind.CANCELLATION`, after mapping existing rows, which is none after the reset.
- `orderLineId` on `ReturnRequest` becomes required.

**Seed:**
- 2 factories, each with Owner, Sales and Packing logins and 6 products.
- 3 live agents more than 2 km apart in Colombo, with hours, plus 1 applicant.
- 6 buyers, one with tokens.
- Baskets in every state OPEN, LOCKED, PACKED, WITH_COURIER and AT_AGENT, with one buyer having a
  ready code.
- One return in AWAITING_HANDOVER.
- One admin for each of AGENTS, FACTORY, CORE and PREMIUM.
- `src/lib/demo-accounts.ts` lists the logins.

- [ ] **Step 1:** Delete in the order above, running `npm run typecheck` after each group and
      fixing imports.
- [ ] **Step 2:** `npx prisma migrate dev --name remove_group_carts`, then
      `npx prisma migrate reset --force` (it seeds). Expected: success.
- [ ] **Step 3:** `npm run check && npm run test:int && npm run e2e`. Expected: all PASS.
- [ ] **Step 4:** Commit the deletions by path (`git add -u <paths>` plus new files): "Remove group
      carts, slips, packing, lots, samples and offers".

### Task 19: Docs, rules and final verification

**Files:**
- `.claude/agents/groupbasket.md`: rewrite the CART, PAY, INV and FUL policy IDs as AGT, ORD,
  BSK, PAY and TOK for this model.
- `.claude/agents/*.md` specialist files:
  - `carts` becomes `orders-baskets`;
  - `payments-slips` becomes `payments`;
  - `packing` is removed;
  - `delivery` becomes the courier booking file;
  - an `agents` file is added.
- `AGENTS.md` routing table.
- `docs/implementation-status.md`, `docs/decisions.md` and `docs/CHANGES.md` (list the retired rule
  IDs).

- [ ] **Step 1:** Update the docs, then run `npm run check:docs`. Expected: PASS.
- [ ] **Step 2:** Run the repo skills in this order:
  1. groupbasket-money-review;
  2. groupbasket-cart-concurrency (on the order and basket services);
  3. groupbasket-access-review;
  4. groupbasket-browser-review;
  5. groupbasket-verification-router.

  Fix the findings.
- [ ] **Step 3:** `npm run check && npm run test:int && npm run e2e && npm run build`. Expected:
      all PASS. Report the actual output.
- [ ] **Step 4:** Commit and push: "Document the area agent model".
