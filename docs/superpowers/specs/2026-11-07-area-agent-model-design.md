# Area agent model: design

**Date:** 2026-11-07. **Status:** draft, for owner approval.
**Brief:** [agent model brief](../../../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-07/brief.md)
**Spec:** [003-area-agent-model](../../../specs/003-area-agent-model/spec.md) (approved; this design
does not change any business rule in it).

## Intent

Replace buyer-run group carts and bank slips with area agents. Buyers pay upfront (tokens first,
the rest by gateway). Paid orders fill an agent's basket per factory, which locks at LKR 50,000
(or ships at 2 months). Admin books the courier from factory to agent. Buyers collect with a
pickup code. Factories are paid in cash every Sunday; everyone else is paid in tokens.

- **Goals:** the spec's FR-001 to FR-036. Every role works at 360 px. Money is exact to the cent.
  Payments are never double-counted and stock is never oversold.
- **Non-goals:** real PayHere (later, behind the same adapter); SMS and email; premium brands and
  design likes (parked); a native app.
- **Anti-goals:** a second way to confirm a payment besides the verified notice; cash leaving the
  platform except factory payouts; gateway calls inside database locks; always-on workers.

## Approaches

| Approach                                                                            | Trade-off                                                                                         | Decision                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A. New tables alongside, then delete old code** (reuse tokens, locks, notices, auth, factory portal, returns, fault holds) | Builds and tests stay green at every step; old code goes only when nothing depends on it. Slightly longer. | **Chosen by the owner**      |
| B. Rewrite today's group cart tables in place                                       | Less new code, but carts are built around members, owners and slips, so leftovers would confuse.  | Rejected                     |
| C. Fresh app                                                                        | Clean, but throws away tested token, lock, return and fault-hold work. Slowest.                   | Rejected                     |

## Constraints (from repo rules)

- Money: `Decimal(14,2)` in the database, and `D`/`toD` from `src/lib/decimal.ts`; never
  JavaScript `number`.
- Pure rules go in `src/lib/`; mutations go in server services inside transactions with row locks.
  Notices are sent after commit.
- Roles are enforced in server queries and actions, not just in the interface.
- Low running cost: server rendering, small client islands, no new paid services. The existing
  cron route (`/api/cron/sweep`, bearer secret) drives time-based work.
- Read `node_modules/next/dist/docs/` before page and route code.

## Data model (decided by Claude; builder may refine names)

All development data is reset (FR-036). A new migration adds:

| Model                                   | Key fields                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Agent`                                 | `userId` (unique), status `APPLIED / APPROVED / LIVE / SUSPENDED / LEFT / REJECTED`, `lat`, `lng`, address, documents (NIC, own photo, storage photos via the existing private storage), `depositPaidAt`, `depositAmount`, `leftAt`, `lossAmount`, `lossNote`                                                                       |
| `AgentHours`                            | `agentId`, `weekday` 0–6, `opensAt`, `closesAt` (minutes)                                                                                                                                                                                                                                                                  |
| `Basket`                                | `agentId`, `factoryId`, status `OPEN / LOCKED / PACKED / WITH_COURIER / AT_AGENT`, `total` (Decimal), `firstOrderAt`, `lockedAt`, `lockReason` `AMOUNT / MAX_WAIT / SUSPENDED`. Partial unique index: one `OPEN` per (`agentId`, `factoryId`)                                                                             |
| `Order`                                 | `buyerId`, `agentId`, `factoryId`, `basketId?` (set when paid), status `PENDING / PAID / CANCELLED / RECEIVED`, `itemsTotal`, `courierTotal`, `agentFeeTotal`, `tokensApplied`, `gatewayFee`, `amountDue`, `holdUntil`, `paidAt`, `receivedAt`                                                                                |
| `OrderLine`                             | `orderId`, `variantId`, `qty`, `unitPrice` (snapshot: factory price + commission), `factoryPrice` (snapshot), `status` (reuse `LineStatus`), `returnedQty`, `collectedAt`                                                                                                                                                 |
| `PaymentAttempt`                        | `purpose` `ORDERS / DEPOSIT`, `buyerId` or `agentId`, `amount`, `currency`, status `PENDING / SUCCEEDED / FAILED / EXPIRED / LATE_PAID`, `gatewayRef` (unique), `createdAt`, `expiresAt`. One attempt covers every order from one checkout (`Order.paymentAttemptId`)                                                              |
| `PaymentEvent`                          | `gateway` + `eventId` unique, `attemptId?`, raw outcome, `verifiedAt`; append-only                                                                                                                                                                                                                                   |
| `PickupCode`                            | `buyerId` + `agentId` unique, `code` (6 digits, unique among the agent's codes)                                                                                                                                                                                                                                       |
| `CourierBooking`                        | `basketId` unique, `fee`, `driverName`, `driverPhone`, `vehicleNo`, `bookedById`, `givenToDriverAt`, `receivedAt`, `failedAt`                                                                                                                                                                                         |
| `FactoryPayout`                         | `factoryId`, `weekEnding` (Saturday 23:59 Asia/Colombo), `gross`, `deductions`, `net`, `bankRef?`, `paidAt?`, `paidById?`, plus `PayoutItem` rows (`orderLineId`, amount) and `PayoutDeduction` rows (kind `RETURN_COURIER / MISSING_ITEM`, amount, ref)                                                                       |
| `TokenEntry` (existing, extended)       | new `TokenKind` values: `LATE_PAYMENT`, `ORDER_CANCEL`, `AGENT_FEE`, `COURIER_REPAY`, `MISSING_ITEM`, `DEPOSIT_RETURN`, `TRANSFER_OUT`, `TRANSFER_IN`; new nullable `orderLineId`, `orderId`, `counterpartyId`. Kept append-only with a unique `eventKey`                                                                    |
| `Settings` (existing, extended)         | `courierPerItem` (40), `agentFeePerItem` (20), `gatewayFeeRate` (0.033), `basketLockAmount` (50,000), `maxWaitDays` (60), `paymentHoldMinutes` (15), `collectHours` (48), `returnHandoverDays` (7), `agentRadiusM` (1000), `agentGapM` (2000), `agentDeposit` (200,000), `commissionPerPiece` (100, existing). Bank fields removed |

**Returns, quality reports, ratings and fault holds** move from `CartLine` to `OrderLine`
(`ReturnRequest.orderLineId` and so on). Their rules stay, plus two new return statuses,
`AWAITING_HANDOVER` and `HANDED_OVER`, and a `handoverAgentId`. `FactoryRole.PLANNER` is removed
and existing users move to `SALES`. `AdminArea.WAREHOUSE` is renamed `AGENTS`. A new `Role.AGENT`
is added and `Role.PACKER` is removed.

**Premium (parked):** brand, submission, review, conversation and settlement tables stay. Gift
reservation links to carts are dropped. No new gift reservations; the routes are hidden.

## Money rules (`src/lib/agent-money.ts`, pure, property-tested)

- `itemsTotal = Σ qty × unitPrice`; `courierTotal = Σ qty × courierPerItem`;
  `agentFeeTotal = Σ qty × agentFeePerItem`; `gross = items + courier + agentFee`.
- `tokensApplied ≤ min(balance, gross)`; `remainder = gross − tokensApplied`.
- `gatewayFee = round2(remainder / (1 − rate) − remainder)`, or 0 when `remainder = 0`.
  `amountDue = remainder + gatewayFee`. With LKR 1,000 / 40 / 20 at 3.3%, the fee is 36.02 and
  the total 1,096.02.
- Basket `total` counts `itemsTotal` only. The LKR 50,000 threshold is goods value, not fees.
  **[Claude's call. Owner to confirm.]**
- Return tokens: factory fault `qty × unitPrice`; buyer fault `qty × (unitPrice − courierPerItem)`.
  Cancel before lock: the full `tokensApplied + remainder + gatewayFee`.
- Factory earning per line: `qty × factoryPrice`, minus returned quantity. The commission stays
  with GroupBasket.

## Lifecycle

```
Order:  PENDING --verified notice--> PAID --basket AT_AGENT--> RECEIVED
          |  hold expires / fail                 |
          +--> CANCELLED (stock released)        +--buyer cancels before lock--> CANCELLED (tokens)
Basket: OPEN --total ≥ lock | firstOrderAt + 60d | agent suspended--> LOCKED
        --Packing "Packed"--> PACKED --admin books + "Given to driver"--> WITH_COURIER
        --agent "Mark received"--> AT_AGENT
```

- **Checkout** (`src/server/orders/checkout.ts`): one transaction per factory group creates a
  `PENDING` order, reserves stock (`reserved += qty`, never below free), holds tokens with the
  existing ledger, and creates a `PaymentAttempt`. The gateway redirect happens after commit.
  Token-only orders skip the gateway and go straight to `PAID`.
- **Notice** (`src/app/api/payments/notify/route.ts`): verify the signature on the raw body before
  parsing, then check amount and currency. Inside one transaction (locking the order, then the
  open basket for that agent and factory):
  - mark the attempt `SUCCEEDED`, the order `PAID`, `reserved → sold`, and spend the token hold;
  - attach the order to the open basket, creating one if none exists, and add `itemsTotal`;
  - if the total reaches the lock amount, lock the basket.
  - If the order has already left `PENDING`, record `LATE_PAID` and credit the amount as
    `LATE_PAYMENT` tokens instead. Duplicate event IDs do nothing.
- **Return page** only reads status. If no notice has arrived, it shows "Checking". The demo
  gateway can be asked for status, and so can PayHere later.
- **Mark received** (agent): sets the basket `AT_AGENT` and the orders `RECEIVED`; credits the
  booked courier fee as `COURIER_REPAY`; records `AGENT_FEE` earnings for Sunday crediting; and,
  after commit, notifies each buyer with their `PickupCode`.
- **Hand over**: the agent types the code and sees that buyer's received, uncollected lines at
  this agent. Hand over sets `collectedAt`.
- **Cron sweep** (existing route, extended; each step in its own short transaction):
  - expire `PENDING` orders past `holdUntil` (release stock and tokens);
  - lock baskets past the maximum wait;
  - escalate overdue returns;
  - cancel returns past the 7-day handover;
  - after Saturday 23:59 Asia/Colombo, build `FactoryPayout` drafts and credit `AGENT_FEE` tokens
    once per week (`eventKey` per agent and week).
  - Page loads do not run the sweep.

## Gateway adapter (`src/server/payments/gateway.ts`)

```ts
interface Gateway {
  createCheckout(a: { attemptId; amount; currency; returnUrl; notifyUrl; buyer }): { redirectUrl };
  verifyNotice(raw: string, headers): { eventId; attemptId; gatewayRef; amount; currency; status } | null;
  fetchStatus(attemptId): Promise<"SUCCEEDED" | "FAILED" | "PENDING">;
}
```

- **Demo gateway:** `/demo-pay/[attemptId]`, a hosted-style page with Pay, Fail and Cancel. It
  posts a notice signed with an MD5 checksum like PayHere's (merchant secret from `.env`), then
  redirects to the return URL. Enabled only when `PAYMENT_GATEWAY=demo`.
- **PayHere:** a later adapter with the same interface.

## Screens (approved contents and layouts; see brief memlog)

| Role                                 | Routes                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer                                | `/` Home, `/shop`, `/products/[id]`, `/cart`, `/checkout`, `/orders`, `/orders/[id]` (return filing), `/tokens` (balance, history, Send), `/account`         |
| Agent                                | `/agent` Home, `/agent/pickups`, `/agent/returns`, `/agent/tokens`, `/agent/hours`; `/agents/apply` public                                                 |
| Factory (Owner, Sales, Packing)      | existing `/seller` workspace, adapted: To pack, Courier booked, Returns, Filling baskets, Production and stock, Earnings and payouts                       |
| Admin                                | `/admin/agents` (Courier to book, Payment problems, Applications, Deposits, 2-month baskets, Search), `/admin/factory` (existing, adapted), `/admin/core` (Payouts, Tokens, Settings, Admins) |

Every home shows its most important item first. No explanation text in the UI.

## Removal order

The old code is deleted once the new flow passes its tests:

- `src/server/carts/*` (except `locks.ts`, which is adapted for orders and baskets);
- slips, packing, receiving, lots, prices, offers, samples and cart chat;
- their pages and routes, `GroupCart`, `CartMember`, `CartLine`, `PaymentSlip`,
  `CartMergeRequest`, `CartInvite`, `Packing`, `Lot`, `PriceChange`, `StockOffer`,
  `SampleRequest` and `CartMessage`;
- their tests.

Policy rule IDs in `.claude/agents/groupbasket.md` are rewritten (CART, PAY, INV, FUL), and the
retired IDs are listed in `docs/CHANGES.md`.

## Verification

- Unit and property tests for `agent-money.ts`, covering cent exactness, fee rounding and return
  amounts.
- Integration tests against `groupbasket_test`:
  - checkout reserving stock;
  - duplicate, forged, mismatched and late notices;
  - concurrent notices locking a basket exactly once;
  - cancel before lock;
  - mark received crediting and notifying;
  - the handover code;
  - return paths, both faults;
  - payout build with deductions;
  - weekly agent credit idempotency;
  - token transfer, which can't go negative;
  - the 2 km clash;
  - suspension.
- Playwright at 360 px for each role's main journey, plus axe and keyboard checks.
- Repo skills: money review, cart concurrency, access review, browser review, then the
  verification router.

## Builder check answers

Answered from the brief and spec:

- **Return trip:** the collecting agent sends returned items back with the factory's next courier
  for that agent. The factory marks them received and chooses whether to put the stock back
  (Claude's call). The trip's cost is the factory's for factory faults; for buyer
  faults it is covered by the courier charge kept from the buyer.
- **PayHere fee on a missing item:** never returned (brief: "PayHere fee are never returned").
  The buyer gets item price, courier charge and agent fee.
- **Deposit:** paid through the gateway including the PayHere fee. Returned as tokens, minus
  losses, when the agent leaves.

Decided by the owner on 2026-11-07:

- **Missing item deduction:** only GroupBasket's loss comes off the factory's next payout: the
  LKR 100 commission plus the courier charge and agent fee refunded to the buyer
  (`PayoutDeduction` kind `MISSING_ITEM`). The factory price is not deducted, since it is never
  paid for that line.
- **Agent leaves:** handled like suspension: no new orders, open baskets lock and ship to them,
  and buyers keep collecting there. Status moves to `LEFT` and the deposit, minus losses, is
  credited as `DEPOSIT_RETURN` tokens only once every parcel and accepted return there has been
  handed over. Never cash.
- **Factory accounts and tokens:** factory staff (Owner, Sales, Packing) have no token wallet and
  cannot send or receive tokens. Transfers to them are refused.

Claude's calls (marked, owner to check):

- **One payment per checkout.** A cart spanning several factories still creates one order per
  factory, but one `PaymentAttempt` and one PayHere fee cover them all. Tokens fill orders in
  turn; the fee is split across orders in proportion to each one's remainder, with the last order
  taking the rounding cent, so a single cancelled order refunds its own share.
- **Cancel before lock** lowers the basket total. `firstOrderAt` moves to the earliest remaining
  paid order, or clears if none is left, so an empty basket has no clock.
- **Deposit details:** tokens cannot pay the deposit; a late deposit payment becomes the agent's
  tokens like any late payment; Agents and orders admin can lift a suspension, returning the agent
  to `LIVE`.

## Left to the builder

File and function names, the exact migration steps, the component split, and the seed contents
(at least 2 factories, 3 agents, 6 buyers, baskets in every state).

## Claude's calls (owner to check)

1. The LKR 50,000 lock counts goods only, not courier, agent fee or PayHere fee.
2. The 2-month clock starts at the basket's first paid order.
3. Sunday agent-fee crediting and payout drafts run in the first cron run after Saturday
   23:59 Asia/Colombo. Core admin marks payouts paid by hand.
4. Agent is a new login role. A person cannot be a factory user and an agent at the same time.
