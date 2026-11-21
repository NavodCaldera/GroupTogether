# Orders in Four Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One stage model (Filling, Packing, On the way, Delivered, Refunded) across the Orders
list and the order page, no buyer cancelling, a 10-day own-basket wait, and a per-buyer payments
view for own baskets.

**Architecture:** A pure `orderStage()` in `src/lib/order-stage.ts` decides the stage from order
and basket status; the list groups by it and the tracker indexes by it. The server adds
`ownMaxWaitDays` and a `basketPayments()` read that returns each buyer's lines and money (money
for others only to the owner). The order page renders: stage heading, tracker card with owner
actions, where card (pickup or delivery), then either the Buyers card (own baskets) or Items +
Payment (agent orders).

**Tech Stack:** Next.js app router (server components), Prisma 7 + PostgreSQL, zod, Tailwind v4,
vitest (unit + integration), Playwright (desktop + mobile).

**Spec:** `specs/004-orders-four-stages/spec.md`

## Global Constraints

- Stage labels, exactly: `Filling`, `Packing`, `On the way`, `Delivered`, `Refunded`.
- Tracker steps, exactly: `Filling`, `Packing`, `On the way`, `Delivered` (no `Paid` step).
- Own-basket wait default `10` days, setting `ownMaxWaitDays`, range 1–365; agent `maxWaitDays`
  stays `60`.
- No Cancel control and no buyer cancel code path anywhere.
- No explanation sentences in the UI; no fact shown twice on one screen; 360 px, 44 px targets,
  dark-mode tokens only.
- Run vitest and Playwright from `E:\` (uppercase drive). Stage files by path, never `-A`.
- Branch `feat/004-orders-four-stages`; PR, green checks, merge; then confirm every remote branch
  is 0 ahead of `origin/main`.

## Review Focus

- A buyer with two paid orders in the same own basket must appear once with summed amounts
  (Task 4 test `merges a buyer's orders`).
- An own basket cancelled by the wait rule must land in Refunded, not Delivered or hidden
  (Task 2 test `refunded own basket`).
- A joiner must never receive other buyers' money from `basketPayments` (Task 4 test
  `joiner sees no money for others`).
- An agent order at the agent with every line collected is still Delivered, not dropped
  (Task 2 test `collected agent order`).
- Orders never paid (expired holds) must not reach the list (Task 3 test `hides never-paid`).

---

### Task 1: Own-basket wait setting (10 days)

**Files:**
- Modify: `prisma/schema.prisma` (Settings: add `ownMaxWaitDays Int @default(10)` after `ownMinItems`)
- Create: `prisma/migrations/20261121200000_own_max_wait_days/migration.sql`
- Modify: `src/lib/agent-settings.ts` (schema field `ownMaxWaitDays: whole(1, 365)`)
- Modify: `src/lib/agent-settings.test.ts`
- Modify: `src/app/admin/settings/page.tsx` (field `["Own basket max wait (days)", "ownMaxWaitDays", s.ownMaxWaitDays, "numeric"]` after `maxWaitDays`)
- Modify: `src/server/orders/own-baskets.ts` (`sweepOwnBaskets` reads `ownMaxWaitDays`)
- Test: `tests/integration/own-baskets.int.test.ts`

**Interfaces:**
- Produces: `Settings.ownMaxWaitDays: number`.

- [ ] **Step 1: Failing tests.** In `agent-settings.test.ts` add `ownMaxWaitDays: "10"` to the valid
  fixture and assert `parseAgentSettings(...).ownMaxWaitDays === 10`; assert `"0"` throws. In
  `own-baskets.int.test.ts` rewrite "past the maximum wait…" to sweep at `Date.now() + 11 * 86_400_000`
  expecting `{ ownClosed: 1, ownCancelled: 2 }`, and add `it("waits until day 10")` sweeping at
  `+ 9 * 86_400_000` expecting `{ ownClosed: 0, ownCancelled: 0 }`.
- [ ] **Step 2: Run** `cd E:\Projects\New\GroupTogether; npx vitest run src/lib/agent-settings.test.ts tests/integration/own-baskets.int.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Migration SQL: `ALTER TABLE "Settings" ADD COLUMN "ownMaxWaitDays" INTEGER NOT NULL DEFAULT 10;`. Run `npx prisma generate` and `npm run db:deploy`.
- [ ] **Step 4: Run** the same tests — expect PASS.
- [ ] **Step 5: Commit** `feat: own baskets wait 10 days (ownMaxWaitDays)`.

### Task 2: Stage model

**Files:**
- Create: `src/lib/order-stage.ts`
- Create: `src/lib/order-stage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Stage = "filling" | "packing" | "on_the_way" | "delivered" | "refunded";
  export const STAGES: readonly Stage[]; // filling, packing, on_the_way, delivered, refunded
  export const STAGE_LABEL: Record<Stage, string>; // "Filling" … "Refunded"
  export const TRACK: readonly Exclude<Stage, "refunded">[]; // the four tracker steps
  export function orderStage(o: {
    status: "PENDING" | "PAID" | "RECEIVED" | "CANCELLED";
    paidAt: Date | null;
    basket: { status: string } | null;
  }): Stage | null; // null = never paid (not listed)
  ```

- [ ] **Step 1: Failing tests** (`order-stage.test.ts`), one `it` each:
  `never paid → null` (PENDING; CANCELLED with paidAt null);
  `OPEN → filling`; `LOCKED → packing`; `PACKED → packing`; `WITH_COURIER → on_the_way`;
  `AT_AGENT → delivered`; `collected agent order` (RECEIVED, AT_AGENT) `→ delivered`;
  `DELIVERED → delivered`;
  `refunded own basket` (CANCELLED with paidAt, basket CANCELLED) `→ refunded`;
  `paid with no basket yet → filling`.
- [ ] **Step 2: Run** `npx vitest run src/lib/order-stage.test.ts` — FAIL.
- [ ] **Step 3: Implement** `orderStage` (paidAt null → null; CANCELLED or basket CANCELLED → refunded; then by basket status; RECEIVED → delivered).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: orderStage — Filling, Packing, On the way, Delivered, Refunded`.

### Task 3: No buyer cancel; list grouped by stage

**Files:**
- Modify: `src/server/orders/baskets.ts` (delete `cancelOrder`), `src/server/orders/locks.ts:9` comment
- Modify: `src/app/orders/[id]/actions.ts` (delete `cancelOrderAction`)
- Modify: `src/server/orders/buyer.ts` (`buyerOrders` where `paidAt: { not: null }`; drop `canCancel`; basket select adds `visibility`, `lockedAt`, `deliveredAt`, `courier: { select: { givenToDriverAt: true } }`)
- Modify: `src/app/orders/order-card.tsx` (replace `stepOf`/`endOf`/`splitOrders` with `orderStage`; tracker via `OrderSteps` on `TRACK`; card badge only for `refunded`)
- Modify: `src/app/orders/page.tsx` (within the tab, sections per `STAGES` with `"<Label> · <count>"` headings, empty hidden)
- Modify tests: `tests/integration/baskets.int.test.ts` (delete the three cancel tests), `tests/integration/own-baskets.int.test.ts` (delete "joiners cancel while OPEN"; drop the `cancelOrder` call in the wait test), `tests/integration/agents.int.test.ts:535-548` (the test needs an OPEN basket with no paid orders: create it with `db.basket.create({ data: { kind: "AGENT", agentId, factoryId, status: "OPEN" } })` instead of checkout + `cancelOrder`)
- Test: `tests/integration/buyer-orders.int.test.ts` (create)

**Interfaces:**
- Consumes: `orderStage`, `STAGES`, `STAGE_LABEL`, `TRACK` (Task 2).
- Produces: `buyerOrders(buyerId)` returns only paid orders with `basket.courier.givenToDriverAt`;
  `OrderSteps({ order, stage, fill?, dates? })`.

- [ ] **Step 1: Failing test** `hides never-paid`: a buyer with one paid and one expired order —
  `buyerOrders` returns only the paid one; and `exports no cancel`:
  `expect("cancelOrderAction" in await import("@/app/orders/[id]/actions")).toBe(false)`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/buyer-orders.int.test.ts` — FAIL.
- [ ] **Step 3: Implement** the deletions and changes listed above.
- [ ] **Step 4: Run** `npx vitest run --project integration` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `feat: no buyer cancel; Orders grouped by stage`.

### Task 4: Per-buyer basket payments

**Files:**
- Modify: `src/server/orders/own-baskets.ts` (replace `basketPeople` with `basketPayments`)
- Test: `tests/integration/own-baskets.int.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BasketBuyer = {
    id: string; name: string; you: boolean; owner: boolean;
    lines: { title: string; size: string; colour: string; qty: number; amount: D | null }[];
    items: number;
    itemsAmount: D | null; payhereFee: D | null; tokens: D | null; paid: D | null;
  };
  export async function basketPayments(basketId: string, viewerId: string): Promise<{
    buyers: BasketBuyer[]; // you first, then owner, then by first payment
    totals: { items: number; itemsAmount: D; payhereFees: D; tokens: D; total: D } | null; // owner only
  } | null>; // null when the viewer has no paid order in it and is not the owner
  ```
  Money (`amount`, `itemsAmount`, `payhereFee`, `tokens`, `paid`) is null for other buyers unless
  the viewer is the owner. Names: full for the owner viewing, first name otherwise. `paid` =
  `tokensApplied + amountDue`. Orders counted: status PAID or RECEIVED; lines ACTIVE.

- [ ] **Step 1: Failing tests:** `owner sees everyone's money` (owner + joiner; owner's `totals.total`
  equals the sum of both `paid`); `joiner sees no money for others` (other buyer's money fields all
  null, `totals` null); `merges a buyer's orders` (joiner pays twice → one entry, items and paid summed);
  `stranger gets null`.
- [ ] **Step 2: Run** `npx vitest run tests/integration/own-baskets.int.test.ts` — FAIL.
- [ ] **Step 3: Implement** `basketPayments` with Decimal sums via `toD`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat: basketPayments — each buyer's items and payment`.

### Task 5: Order page

**Files:**
- Modify: `src/app/orders/[id]/page.tsx`
- Modify: `src/server/orders/buyer.ts` (`buyerOrder` adds `pickup: { code, pieces, fee } | null` for an agent order with uncollected lines at RECEIVED, totals per agent as `buyerHome` does)
- Modify: `src/app/own-baskets/[id]/page.tsx` (tracker labels from `TRACK`)
- Modify: `tests/e2e/buyer.spec.ts`, `tests/e2e/own-baskets.spec.ts`, `tests/e2e/own-basket-joins.spec.ts`

**Interfaces:**
- Consumes: `orderStage`, `TRACK`, `STAGE_LABEL`, `OrderSteps`, `basketPayments`.

Layout (top to bottom): Back · H1 = `STAGE_LABEL[stage]` · line `product title (+N more) · factory`.
Card 1: tracker (dates: Filling = order `paidAt`, Packing = basket `lockedAt`, On the way =
`courier.givenToDriverAt`, Delivered = `deliveredAt` own / `receivedAt` agent), Filling fill,
next line, owner actions by stage (Share, Place order, Who can join; Received), pickup code block
when `pickup`. Card 2: agent → name, address, open now + hours, Map; own → `You · area` + address
for the owner, area only for joiners. Own basket → Card 3 Buyers (from `basketPayments`):
per buyer name, line rows `title · size × qty   amount`, then `PayHere fee`, `Tokens` (if > 0),
`Paid`; divider; owner totals: `Basket · N items`, `Items`, `PayHere fees`, `Total`,
`Courier fee  On delivery` (until delivered). Agent order → Items (photo rows, return forms) and
Payment as today, PayHere row hidden at 0. Returns, Rate, How did it fit? stay. No Cancel.

- [ ] **Step 1: Failing e2e.** `own-baskets.spec.ts`: on the owner's order page expect heading
  `Filling`, `getByRole("heading", { name: "Buyers" })`, the joiner's name, a `Total` row, and
  `getByRole("button", { name: /cancel/i })` count 0. `buyer.spec.ts`: replace the Cancel steps with
  `expect(page.getByText("Cancel order")).toHaveCount(0)`; card selector uses
  `[aria-current="step"]` hasText `Filling` (unchanged); heading `Filling` on the order page.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/buyer.spec.ts tests/e2e/own-baskets.spec.ts tests/e2e/own-basket-joins.spec.ts` — FAIL.
- [ ] **Step 3: Implement** the page and `buyerOrder.pickup`.
- [ ] **Step 4: Run** the same e2e plus `tests/e2e/accessibility.spec.ts`, `npx tsc --noEmit`, `npx eslint src` — PASS. Screenshot owner, joiner and agent-ready at 390 px and 920 px.
- [ ] **Step 5: Commit** `feat: order page — stage heading, Buyers card, pickup code`.

### Task 6: Docs, PR, merge

**Files:**
- Modify: `docs/decisions.md` (add `DEC-026`: no buyer cancel after payment, replaces ORD-004 buyer cancel and DEC-023 §5; own-basket wait 10 days `ownMaxWaitDays`, replaces DEC-023 §7's 60; owner sees every buyer's payment)
- Modify: `.claude/agents/groupbasket.md` (ORD-004, DEC-023 lines), `.claude/agents/orders-baskets.md`, `.claude/agents/frontend.md`, `CLAUDE.md`, `docs/CHANGES.md`, `docs/implementation-status.md`

- [ ] **Step 1:** Write the docs above.
- [ ] **Step 2:** `git add` each file by path; commit `docs: DEC-026 orders in four stages`.
- [ ] **Step 3:** `git push -u origin feat/004-orders-four-stages`; `gh pr create`; wait for checks; `gh pr merge --merge --delete-branch`.
- [ ] **Step 4:** `git fetch --prune`; for each remote branch `git rev-list --count origin/main..<branch>` — expect `0`.
