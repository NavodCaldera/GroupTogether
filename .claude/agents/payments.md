---
name: payments
description: "Payment gateway adapter, demo gateway, verified notices, late and duplicate payments, token ledger and transfers, and weekly factory payouts for GroupBasket."
---

# Payments

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `PAY-004`–`PAY-007`, `TOK-001`–`TOK-003`, `AGT-002`, `AGT-005`, `BSK-006`,
`BSK-007`. Bank slips and owner payment (`PAY-001`–`PAY-003`) are retired.

## Ownership and code

- Gateway: `src/server/payments/gateway.ts` (the `Gateway` interface and `getGateway`),
  `demo.ts` (signed notice, MD5 checksum like PayHere), `notice.ts` (`handleNotice`).
- Routes: `src/app/api/payments/notify/route.ts`, the hosted demo page `src/app/demo-pay/`,
  the return page `src/app/checkout/return/`.
- Tokens: `src/server/tokens.ts` (`post`, `credit`, `transferTokens`, `assertTokenHolder`,
  holds), `src/lib/token-rules.ts`; buyer page `src/app/tokens/`, agent page `/agent/tokens`.
- Payouts and agent fees: `src/server/payouts/index.ts` (`weekOf`, `payableLines`,
  `buildWeeklyPayouts`, `creditAgentFees`, `markPayoutPaid`); Core pages `src/app/admin/core/`.
- Sweep: `src/server/sweep.ts` `runSweep`, called only by `/api/cron/sweep`.
- Order and basket effects of a payment belong to [orders-baskets](orders-baskets.md); deposits
  to [agents](agents.md).

## Implementation guards

- `PAYMENT_GATEWAY=demo` selects the demo gateway; `DEMO_MERCHANT_SECRET` signs notices. A real
  PayHere adapter must implement the same interface and change nothing else. It waits for
  PayHere's written approval of this model (`DEC-016`).
- Verify the signature on the raw body before parsing, then the amount and currency against the
  attempt. `PaymentEvent (gateway, eventId)` is unique: a repeated notice does nothing. A browser
  return never confirms a payment.
- A notice for an attempt that is no longer `PENDING`, or whose amount differs, credits the
  received amount as `LATE_PAYMENT` tokens with event key `late:<attemptId>:<paymentId>`. Never
  return cash.
- PayHere fee: `round2(remainder / (1 − rate) − remainder)`, 0 when the remainder is 0. LKR 1,000
  item + 40 + 20 at 0.033 gives 36.17 and a total of 1,096.17. One attempt covers all orders of a
  checkout; the fee is split by remainder with the last order taking the rounding cent.
- The ledger is append-only with a unique `eventKey`. A balance never goes below zero. Factory
  accounts and staff hold no tokens; transfers to them are refused.
- Payouts: a line is payable `collectHours` after agent receipt with no open return and no pending
  missing report; LAPSED returns earn again. Earning is `qty × factoryPrice` less returned
  quantity. Deductions (`RETURN_COURIER`, `MISSING_ITEM`) wait for a week with items.
  `Settings.payoutsBuiltThrough` marks the last built week. Agent fees are credited once per agent
  and week. Weeks end Saturday 23:59:59 Asia/Colombo.
- The sweep runs only from cron. Production must schedule `/api/cron/sweep` with its bearer secret
  (`DEC-016`); page loads never run it.

## Verification and coordination

Unit: `src/server/payments/demo.test.ts`, `agent-money` tests, `token-rules.test.ts`.
Integration: `payments.int.test.ts`, `tokens.int.test.ts`, `token-transfer.int.test.ts`,
`payouts.int.test.ts`. Apply `groupbasket-money-review` for any amount, fee, token or payout
change. Cover forged, duplicate, mismatched and late notices and concurrent notices locking a
basket once. See [qa-review](qa-review.md).
