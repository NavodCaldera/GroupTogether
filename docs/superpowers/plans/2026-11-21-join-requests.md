# Join Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Own baskets are joined by request (owner accepts or declines), not share links.

**Spec:** `specs/006-join-requests/spec.md`

## Global Constraints

- Labels: `Ask to join`, `Asked`, `Declined`, `Accept`, `Decline`, `Requests`.
- Stage by path; tests from `E:\`; PR, green, merge; no remote branch ahead of `origin/main`.
- No explanation sentences; no fact twice; 360 px; 44 px.

## Review Focus

- A crafted `ownFromCartAction` / `startOwnCheckout` into a basket without acceptance or a paid
  order is refused (Task 1 test `refuses a buyer who was not accepted`).
- Only the owner answers; only while OPEN (Task 1 tests).
- A declined buyer cannot ask again or pay (Task 1).

### Task 1: Join requests on the server

**Files:** `prisma/schema.prisma` (`OwnJoinRequest`: id, basketId, buyerId, status
`PENDING|ACCEPTED|DECLINED`, `lines Json`, createdAt, decidedAt; unique basketId+buyerId),
migration; `src/server/orders/own-baskets.ts`: `askToJoin(buyerId, basketId, fromCart)`,
`answerJoinRequest(ownerId, requestId, accept)`, `joinRequests(ownerId, basketId)` (pending, with
name and items), `openOwnBaskets(factoryId, viewerId)` replacing `publicOwnBaskets` (adds
`state: "ask" | "asked" | "declined" | "pay"`); `joinable` = owner, paid member or accepted;
remove `setOwnVisibility`, share code and visibility from create; notices. Seed: joins go through
ask + accept. Test: `tests/integration/own-baskets.int.test.ts`.

- [ ] Failing tests: ask records items and notifies owner; asking twice refused; other factory
  refused; owner accepts → buyer can pay; declined cannot pay or ask again; non-owner cannot
  answer; answers refused once not OPEN; refuses a buyer who was not accepted; list shows states.
- [ ] Implement; run integration project — PASS. Commit.

### Task 2: Pages

`src/app/cart/page.tsx` Join panel (rows with Ask to join form / Asked / Declined; accepted ones
as radios + Pay); New basket loses Who can join; `src/app/orders/[id]/page.tsx` loses Share basket
and Who can join, gains Requests card with Accept/Decline; `order-card.tsx` loses Share;
`/own-baskets/[id]` redirects members to their newest order (any status), else 404; actions
`askToJoinAction`, `answerJoinAction`; remove `setVisibilityAction`, `joinOwnBasketAction`,
`SizeQuantities`. e2e: rewrite joins and own-baskets specs to ask → accept → pay.

- [ ] Failing e2e; implement; run own-baskets, own-basket-joins, cart-choice, accessibility — PASS.
  Commit.

### Task 3: Docs, review, PR

DEC-028, DEC-023/027 wording, CHANGES, CLAUDE.md, agents, implementation status. Fresh review,
fix pass, PR, merge, branch check.
