---
name: group-deals
description: "Group deals with quantity price tiers, the shared units-sold count, deal settlement in the sweep, DEAL_REBATE tokens, category commission and payouts at the final tier for GroupBasket (DEC-029)."
---

# Group deals

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `DEAL-001`–`DEAL-004`, `DEC-029`, `PAY-004`, `PAY-007`, `TOK-001`, `BSK-*`,
`BSK-007`, `RETURN-001`.

**Status: Planned.** Today prices are fixed: `buyerPrice = factoryPrice + commission`
(`src/lib/price-rules.ts`), with `Settings.commissionPerPiece` snapshotted into
`Product.commission` and copied to `OrderLine.unitPrice`/`factoryPrice` at order time.

## Target data model

- `GroupDeal`: `productId`, `factoryId`, `startsAt`, `endsAt`, `maxQty?`, `status`
  (DRAFT/LIVE/CLOSED/SETTLED/CANCELLED), `unitsSold`, `finalTierId`.
- `PriceTier`: `dealId`, `minQty` (tier 1 has 1), `factoryPrice`, `buyerPrice` (factory price plus
  category commission, copied when the deal goes live). Unique `[dealId, minQty]`.
- `OrderLine`: `dealId`, `paidUnitPrice`, `finalUnitPrice`.
- `TokenKind.DEAL_REBATE`, event key `deal-rebate:<dealId>:<orderLineId>`.

## Implementation guards

- Money is `Decimal(14,2)` with `D`/`roundMoney`; never JavaScript `number`.
- Checkout increments `unitsSold` in the order transaction while holding the deal row
  (`SELECT … FOR UPDATE`). Place the deal lock in the documented lock order in
  [AGENTS.md](../../AGENTS.md): after `Order` rows and basket locks, before ledger `User` rows; keep
  variant rows after basket advisories. Refuse units beyond `maxQty`.
- Buyers pay tier 1's `buyerPrice`. Tiers can't change while LIVE.
- Settlement runs only in `runSweep`: close deals past `endsAt`, pick the highest tier with
  `minQty <= unitsSold`, set `finalUnitPrice`, credit `(paid − final) × qty` minus missing or
  returned quantity, once per line (unique event key). Re-running settlement does nothing.
- Missing items (`BSK-007`) and returns before settlement decrement `unitsSold`; after settlement
  the tier is fixed. Refunds use the price actually paid less any rebate already given.
- Payouts (`PAY-007`) use the final tier's factory price; a line from an unsettled deal is held.
- Commission comes from the category (`commissionPct`, `minCommission`, inherited), resolved in
  `src/lib/price-rules.ts`. Old listings keep their snapshot.
- Shipping is the basket's job; never lock or ship baskets from deal code.

## Verification and coordination

Apply `groupbasket-money-review` and `groupbasket-cart-concurrency`. Integration: concurrent
checkouts at a tier boundary (no lost count), capacity refusal, settlement twice (no double
rebate), missing item before and after settlement, payout at the final price. E2E: two buyers, the
tier drops, the sweep settles, both see the rebate on Tokens. Coordinate with
[payments](payments.md), [orders-baskets](orders-baskets.md), [taxonomy](taxonomy.md) and
[notifications](notifications.md) (deal closed and rebate notices).
