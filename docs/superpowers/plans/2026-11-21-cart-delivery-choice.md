# Cart Delivery Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cart lets a buyer tick items and send them by Agent pickup, My basket or Join a
basket; own baskets hold any products of one factory.

**Architecture:** Server first. `startCheckout`/`quoteCheckout` take an optional `variantIds`
subset of the cart. `startOwnCheckout` validates lines by factory instead of one product, with a
create that no longer names a product; new reads `myOpenOwnBaskets(buyerId, factoryId)` and
`publicOwnBaskets(factoryId, viewerId)`. The cart page is a server page driven by a GET form
(`sel` = ticked variant ids, `how` = agent | mine | join); the panels post to `/checkout`
(agent, GET with `items`) or to `ownFromCartAction` (own baskets).

**Tech Stack:** Next.js server components + server actions, Prisma 7, Decimal, vitest, Playwright.

**Spec:** `specs/005-cart-delivery-choice/spec.md`

## Global Constraints

- Choice labels, exactly: `Agent pickup`, `My basket`, `Join a basket`; `Select all`; `New basket`.
- An own basket holds products of its `factoryId` only; `Basket.productId` is no longer set for new
  baskets (kept for old rows).
- No per-item quantity limit beyond stock.
- No explanation sentences; no fact twice; 360 px; 44 px targets.
- Tests from `E:\`; stage by path; branch `feat/005-cart-delivery-choice`; PR, green, merge;
  confirm no remote branch ahead of `origin/main`.

## Review Focus

- A ticked item removed from the cart in another tab before paying is skipped, not bought
  (Task 1 test `ignores ids not in the cart`).
- Mixed-factory selection must never reach an own basket, even by a crafted request (Task 2 test
  `refuses another factory's items`).
- Joining someone's link-only basket from the cart is not offered; joining by share link still
  works on the basket page (Task 2 test `public list excludes link-only and own`).
- Old one-product baskets accept other products of their factory (Task 2 test `old basket takes
  another product`).
- Untick everything: choices disabled (Task 3 e2e).

---

### Task 1: Agent checkout for a subset of the cart

**Files:** Modify `src/server/orders/checkout.ts` (`loadCart(tx, buyerId, rates, variantIds?)`,
`planCheckout`, `quoteCheckout(buyerId, agentId, tokens, variantIds?)`,
`startCheckout(buyerId, { agentId, tokens, requestKey, variantIds? })`; delete only those cart
items), `src/app/checkout/page.tsx` + `actions.ts` (carry `items` = comma-separated variant ids
through the GET form, hidden field and redirects). Test: `tests/integration/checkout-subset.int.test.ts`.

**Interfaces:** Produces `variantIds?: string[]` on the three functions; undefined = whole cart.

- [ ] **Step 1: Failing tests:** `buys only the ticked items` (cart of 3 variants, checkout 2 →
  orders' lines cover 2, cart keeps 1); `ignores ids not in the cart` (unknown id → bought set is
  the intersection; none left → "Your cart is empty").
- [ ] **Step 2: Run** `npx vitest run tests/integration/checkout-subset.int.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** plus `tests/integration/baskets.int.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat: agent checkout for ticked cart items`.

### Task 2: Own baskets by factory

**Files:** Modify `src/server/orders/own-baskets.ts`:
- `OwnBasketCreate` drops `productId`; factory comes from the lines.
- `loadFactoryLines(tx, factoryId | null, lines)` replaces `loadProductLines`: every variant's
  product is LIVE, priced, and of one factory (= basket's `factoryId` when joining); returns lines
  with their own `unitPrice`/`factoryPrice`.
- `startOwnCheckout` uses per-line prices; new baskets get `productId: null`.
- `publicOwnBaskets(factoryId, viewerId)` (PUBLIC, OPEN, paid, not owned by viewer).
- `myOpenOwnBaskets(buyerId, factoryId)` (owned, OPEN, paid).
- `ownBasketView` returns `factory: { name }` and `products` (live products already in the basket
  with variants) instead of `product`.
- `announceOwnBasket` body is the factory name.
Modify `src/app/own-baskets/actions.ts` (`startOwnBasketAction` removed; add
`ownFromCartAction(fd)`: `items`, `basketId` or new-basket fields, `tokens`, `requestKey`; lines
from the buyer's cart rows for those variant ids). `src/app/own-baskets/new/page.tsx` redirects to
`/cart`. Seed (`prisma/seed.ts` `own()` helper) drops `productId` from create.
Test: `tests/integration/own-baskets.int.test.ts`.

**Interfaces:** Produces `startOwnCheckout(buyerId, { create?: { visibility, address, area, phone },
basketId?, shareCode?, lines, tokens, requestKey })`; `publicOwnBaskets(factoryId, viewerId)` and
`myOpenOwnBaskets(buyerId, factoryId)` → `{ id, area, owner (first name), items }[]`.

- [ ] **Step 1: Failing tests:** `holds two products of one factory`; `refuses another factory's
  items` (create and join); `old basket takes another product` (row with productId set);
  `public list excludes link-only and own`; `my open baskets per factory`. Update existing tests to
  the new `create` shape and `publicOwnBaskets(factoryId, …)`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run --project integration` — PASS.
- [ ] **Step 5: Commit** `feat: own baskets hold any products of one factory`.

### Task 3: Cart page

**Files:** Rewrite `src/app/cart/page.tsx`; keep `qty-stepper.tsx`; modify `src/app/own-baskets/[id]/page.tsx`
(title = factory name, join form = sizes of `products`). e2e: rewrite the own-basket start/join
steps in `tests/e2e/own-baskets.spec.ts`, `tests/e2e/own-basket-joins.spec.ts`, and the checkout
step in `tests/e2e/buyer.spec.ts` to use the new cart.

Layout: Back · Cart · GET form: `Select all` + factory groups of rows (checkbox `sel`, photo,
title · size, qty stepper, Remove, line total) · `Get the N selected by` with three submit buttons
(`how`); panel for `how`: agent radio list (nearest 3 + chosen) → GET `/checkout` with `agentId` +
`items`; My basket radio list (`myOpenOwnBaskets` + `New basket` fields) + tokens → `ownFromCartAction`;
Join radio list (`publicOwnBaskets`) + tokens → `ownFromCartAction`. Mixed factories: the two
basket buttons disabled.

- [ ] **Step 1: Failing e2e:** select two items of one factory → My basket → New basket → pay →
  cart keeps the third; Join lists the other buyer's basket of that factory; nothing ticked →
  choice buttons disabled; mixed factories → basket buttons disabled.
- [ ] **Step 2: Run** the three specs — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the three specs + `accessibility.spec.ts`; screenshots 390/920 — PASS.
- [ ] **Step 5: Commit** `feat: cart — tick items, choose how to get them`.

### Task 4: Docs, PR, merge

`docs/decisions.md` DEC-027 (factory baskets; cart delivery choice; no quantity limit),
`DEC-023` wording, `.claude/agents/groupbasket.md`, `orders-baskets.md`, `frontend.md`, `CLAUDE.md`,
`docs/CHANGES.md`. Commit by path; PR; checks; merge; branches 0 ahead.
