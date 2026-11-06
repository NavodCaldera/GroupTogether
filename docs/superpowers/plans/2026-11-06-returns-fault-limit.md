# Returns rebuild and factory fault limit: implementation plan

> **For the builder (Codex):** no sub-skill is required. Work through Tasks 1 to 5 directly, in
> order, following the steps. Steps use checkbox (`- [ ]`) syntax for tracking. The prompt is
> `docs/superpowers/prompts/returns-fault-limit.md`. Claude Code reviews.

**Goal:** Give factories a 24-hour return deadline and let admins see every return. Count
factory-fault items, and hide a factory on its 2nd fault in 12 months for an admin's
continue/remove decision. Make one shared cart clean-up that never touches carts booked with
PickMe.

**Architecture:**

- Record a fault, and open a hold, inside the existing locked return transaction.
- After that transaction commits, an idempotent `enforceHold` hides products and runs a shared
  per-cart clean-up. `sweep()` retries it.
- Ordinary product hides shrink to OPEN/READY carts only.

**Tech Stack:** Next.js 16.4.3 (read `node_modules/next/dist/docs/` first), Prisma 7/PostgreSQL,
Decimal money through `D`/`toD`, Vitest, Playwright.

**Spec:**

- [design](../specs/2026-11-06-returns-fault-limit-design.md) (binding);
- [spec](../../../specs/001-factory-partnership/spec.md): US7, US8, FR-019a, FR-021, FR-030,
  FR-034 to FR-038 and the 2026-11-06 clarifications.

## Global Constraints

- The factory answer window is **24 hours** for new returns. Open returns keep their stored
  `factoryDueAt`.
- A fault is the return's `qty` (units) for a `fault = FACTORY` return, recorded when the return is
  **accepted**, by the factory (`FACTORY`) or an admin (`ADMIN`).
- A hold opens when the uncancelled fault units with `recordedAt > now − 12 months` (calendar
  months back) are **≥ 2**, and no hold is open. Faults keep counting after "continue".
- Carts:
  - a cart in `DISPATCHED` or `DELIVERED` is **never** changed by a hold, a removal or a hide;
  - an ordinary hide changes only `OPEN`/`READY`.
- Unpaid cancellation gives **no** new tokens and releases holds. Paid (`CONFIRMED`) cancellation
  gives full-price tokens through `cancelPaidLines`.
- Hold-thread messages are 1–1000 characters, 10 per minute per user, and can be posted only while
  the hold is open.
- Decision and cancel notes are 1–2000 characters.
- Lock order: user advisory locks, then cart rows, then ledger users. Never lock other carts inside
  a return transaction.
- No new dependencies. No cash refunds (`PAY-003`). No `gb_ai_reader` grants. Phone first, existing
  primitives, no explainer text.

## Review Focus

1. **Two accepts that both reach the 2nd fault at the same moment** must open exactly one hold.
   Test it in Task 2.
2. **A "continue" decided while the clean-up is still running** must leave admin-hidden products
   hidden and must not re-hide anything afterwards. Test it in Task 4.
3. **A slip approval racing a hold clean-up:** the cart ends either cancelled unpaid with holds
   returned, or confirmed and then cancelled with full credits. Never confirmed with no credits,
   and never both. Test it in Task 3.
4. **A removed factory reaching a fault** (a return accepted by an admin after removal) must not
   open a hold. Test it in Task 2.
5. **Fault-window boundary:** faults on 5 Jun 2026 and on 5 Jun 2027 must not combine on
   6 Jun 2027. Test it in Task 2.

---

### Task 1: 24-hour deadline and admin visibility

**Files:**

- Modify: `src/server/returns.ts`, `src/lib/return-rules.ts` (+ `.test.ts`), and
  `src/app/admin/factory/returns/**`.
- Test: `tests/integration/returns.int.test.ts`.

**Interfaces:**

- Produces: `factoryOverdue(dueAt: Date, now: Date): boolean`. It replaces the `createdAt`-based
  version.

- [ ] Write the failing tests:
  - `files with a 24h factory deadline`: `factoryDueAt − createdAt === 24*3600000`.
  - `escalates 24h plus 1 minute but not 23h59m`, through `escalateOverdue(now)`.
  - `keeps a stored 48h due time`: a fixture row with `factoryDueAt = created + 48h` is not
    escalated at 25h.
  - `factoryDecide is refused after the stored due time`.
  - `notifies FACTORY and CORE admins at filing`: one notice each, none to PREMIUM/WAREHOUSE.
  - `admin can view WAITING_FACTORY but adminDecide is refused` with "This return has already
    been decided".
- [ ] Run `npx vitest run tests/integration/returns.int.test.ts` and confirm they FAIL.
- [ ] Implement:
  - `fileReturn` sets the due time to `now + 24h`;
  - `factoryDecide`/`escalateOverdue` use the stored `factoryDueAt`;
  - `queue(tx, r, "filed", "Return requested", "admin")` in addition to the factory notice;
  - the admin list shows WAITING_FACTORY rows view-only, with a due-time label.
- [ ] Run the tests and confirm they PASS. Commit.

### Task 2: Fault records and opening a hold

**Files:**

- Modify: `prisma/schema.prisma`, `src/server/returns.ts`.
- Create: migration `factory_fault_limit`, `src/server/fault-holds.ts`.
- Test: `tests/integration/fault-holds.int.test.ts`.

**Interfaces:**

- Produces:
  - models `FactoryFault`, `FaultHold`, `FaultHoldMessage`, and `Product.hiddenByHoldId`, exactly
    as in the design's Data section;
  - `recordFault(tx: Tx, r: ReturnRequest, by: "FACTORY" | "ADMIN", byId: string, now: Date): Promise<FaultHold | null>`.
    It returns a newly opened hold, or null.
  - `countedFaultUnits(client: Tx, factoryId: string, now: Date): Promise<number>`.

- [ ] Write the failing tests:
  - `factory accepts a factory-fault return of qty 3`: one fault with 3 units, and a hold opens.
  - `qty 1 then qty 1 opens a hold on the second`. The first gives none.
  - `buyer-fault accept and any rejection record no fault`.
  - `admin accept of a factory-fault return records confirmedBy ADMIN`, including an accept after
    receipt.
  - `window boundary`: faults on 2026-06-05 and on 2027-06-05 give a count of 1 on 2027-06-06.
    Two faults 11 months apart open a hold.
  - `cancelled fault does not count`.
  - `same return never records twice`.
  - `parallel accepts reaching 2 open one hold` (`Promise.allSettled` on two different returns of
    the same factory). Exactly one open hold.
  - `removed factory opens no hold`.
  - `hold notices`: the factory account and OWNER staff get "Your shop is on hold", FACTORY/CORE
    admins get "Factory on hold", and Sales/Packing get nothing.
- [ ] Run and confirm they FAIL.
- [ ] Write the migration:
  - the partial unique index `FaultHold(factoryId) WHERE "decidedAt" IS NULL`;
  - a unique index on `FactoryFault.returnId`;
  - no grants.
- [ ] Implement `recordFault`, calling it from the ACCEPTED moves in `factoryDecide` and
  `adminDecide`.
  - Opening the hold inserts with `ON CONFLICT DO NOTHING` semantics. A unique violation means "a
    hold is already open".
  - It does not hide products here.
- [ ] Run the tests and confirm they PASS. Commit.

### Task 3: Enforcing a hold and the shared clean-up

**Files:**

- Modify: `src/server/quality.ts` (replace `cleanProducts`), `src/server/carts/service.ts` (export
  a locked-cart unpaid cancel), `src/server/carts/confirmation.ts`, `src/server/agreements.ts`,
  `src/server/returns.ts` (call after commit).
- Test: `tests/integration/fault-holds.int.test.ts`, `tests/integration/quality.int.test.ts`.

**Interfaces:**

- Produces:
  - `enforceHold(holdId: string): Promise<void>`. It is idempotent, and `sweep()` calls it for open
    holds with `cleanedAt = null`.
  - `cleanFactoryCarts(factoryId: string, reason: string, actorId: string): Promise<void>`.
  - `cancelUnpaidCart(tx: Tx, cart: GroupCart, reason: string)`. It wraps the existing private
    `close(tx, cart, "CANCELLED", reason)`, so the release code is reused.
- Consumes: `cancelPaidLines`, `removeHiddenProductLines`, `withCartTransaction`, `lockCart`.

- [ ] Write the failing tests, with one fixture factory and carts in every status:
  - `OPEN/READY lines removed, Done reset, stock and holds released`;
  - `AWAITING_SLIP and SLIP_REVIEW carts CANCELLED, holds returned, no CANCELLATION/RETURN credit`;
  - `CONFIRMED cart: each line owner credited unitPrice×qty once, cart cancelled`;
  - `DISPATCHED with BOOKED, PICKED_UP and FAILED deliveries, and DELIVERED: unchanged`;
  - `enforceHold twice gives one credit per line`;
  - `products hidden with hiddenByHoldId; already-hidden products keep their original hide`;
  - `factory on hold: canSellIn false, saveProduct refused, factoryDecide and postReturnMessage still work`;
  - `slip approval racing enforceHold` (Review Focus 3);
  - `removeFactory uses the same clean-up` (the same status table);
  - `ordinary hideProduct: AWAITING_SLIP, CONFIRMED and DISPATCHED carts unchanged; confirmation keeps the hidden line ACTIVE`.
- [ ] Run and confirm they FAIL.
- [ ] Implement, following the design's "Enforcing a hold" and "Shared cart clean-up" sections.
  - Remove the hidden-product cancellation block from `confirmPaidCart`.
  - Update the Part 3 tests that asserted the old rule, and name each one you change in the commit
    body.
  - Add the open-hold check to `canSellIn`.
- [ ] Run the tests and the full `npm run test:int`, and confirm they PASS. Commit.

### Task 4: Admin decision, fault cancel and the hold thread

**Files:**

- Modify: `src/server/fault-holds.ts`, `src/server/returns.ts` (extract the shared message
  helpers).
- Test: `tests/integration/fault-holds.int.test.ts`.

**Interfaces:**

- Produces:
  - `decideHold(adminId: string, holdId: string, decision: "CONTINUE" | "REMOVE", note: string): Promise<FaultHold>`
  - `cancelFault(adminId: string, faultId: string, note: string): Promise<FactoryFault>`
  - `postHoldMessage(userId: string, holdId: string, body: string)`
  - `listHoldMessages(userId: string, holdId: string)`
  - `factoryFaults(userId: string)`, for owners only
  - `adminHolds(adminId: string)`

- [ ] Write the failing tests:
  - `continue un-hides only hiddenByHoldId products; cancelled carts stay cancelled`;
  - `after continue the next fault opens a new hold`;
  - `remove closes the hold and runs removeFactory (staff locked)`;
  - `two decideHold calls give one outcome`;
  - `continue during an unfinished enforceHold` (Review Focus 2);
  - `cancelFault needs a note, keeps history and stops counting`;
  - `hold thread`:
    - FACTORY/CORE admins and factory OWNERs can post and read;
    - SALES, PACKING and PLANNER staff, another factory, PREMIUM/WAREHOUSE admins and a buyer are
      refused (404);
    - posting after the decision is refused but reading still works;
    - a body of 0 or 1001 characters is refused;
    - the 11th message in a minute is refused;
  - `factoryFaults refused for non-owner staff`.
- [ ] Run and confirm they FAIL.
- [ ] Implement:
  - `decideHold` takes the hold row lock first and refuses a decided hold;
  - REMOVE calls `removeFactory(adminId, factoryId, note, false)`;
  - message helpers shared with return threads, not copied.
- [ ] Run the tests and confirm they PASS. Commit.

### Task 5: Pages, browser journey and docs

**Files:**

- Modify: `src/app/seller/returns/**` (owner faults list, hold banner and thread),
  `src/app/admin/factory/quality/**` (holds with thread and Continue/Remove with a note; faults
  with Cancel and a note).
- Docs:
  - `docs/decisions.md` (DEC-013: the 2026-11-06 rules, replacing the accepted-cart hide rule);
  - `.claude/agents/groupbasket.md` (`RETURN-001`, `QUAL-001` and a new `FAULT-001`);
  - `docs/implementation-status.md`, `docs/architecture.md`, `docs/CHANGES.md`;
  - `.claude/agents/catalogue-admin.md`, `carts.md`, `notifications.md`.
- Test: `tests/e2e/fault-hold.spec.ts`.

- [ ] Write the failing e2e test:
  1. The factory accepts its 2nd factory-fault return.
  2. The owner sees the hold banner and the faults.
  3. The admin and the owner exchange a message.
  4. The admin chooses Continue with a note.
  5. The listing is visible again.
  - Run it at desktop and 360px, with Axe at zero and no horizontal overflow.
- [ ] Build the pages, then run the e2e production build and the full suite, and confirm they PASS.
- [ ] Run the refusal check for `FactoryFault`, `FaultHold` and `FaultHoldMessage` with the
  restricted reader.
- [ ] Commit.
