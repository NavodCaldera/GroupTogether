---
title: GroupBasket area agent model
status: draft
created: 2026-11-07
updated: 2026-11-07
---

# GroupBasket area agent model

## Problem and promise

- **Buyers: cost.** Clothes come straight from the factory, without wholesale or retail markups.
- **Factories: time.** Sold stock leaves in paid bulk orders, and money arrives every Sunday.

Group baskets run by buyers are replaced by **area agents**: local people who collect deliveries
for their area and hand them to buyers.

## People

| Who | Role |
|---|---|
| Buyer | Shops across factories, pays upfront, collects from an agent |
| Agent | Holds one open basket per factory, receives deliveries, hands over parcels, collects returns |
| Factory | Lists products, packs locked baskets, decides returns, receives cash every Sunday |
| Admin | Approves agents and factories, books couriers, decides escalated returns, runs payouts |

## Buying

1. The buyer chooses items and an agent. The nearest agent is selected by default, with its
   distance shown, and the buyer can change it.
2. Checkout shows the item price, a fixed courier charge per item (Settings), applied tokens and a
   **PayHere fee**. The total is the final amount. The fee is charged only on the part paid
   through PayHere, at a rate set in Settings, and is calculated so that GroupBasket receives the
   full amount.
3. Tokens apply first. If tokens cover everything, no PayHere payment is needed.
4. Only a paid order joins that agent's open basket for the factory. Orders are never split.
5. The basket locks automatically at LKR 50,000 and a new basket opens for that agent and factory.
   A basket still under LKR 50,000 after 2 months ships anyway, and GroupBasket covers any
   courier shortfall.

## Delivery and collection

- The factory packs the locked basket. Admin gets the fee from the courier service, books the
  courier and enters the driver details and fee.
- The agent pays the driver on arrival, confirms receipt, and is repaid exactly the booked fee in
  tokens.
- The buyer has **48 hours** after the agent marks an order received to collect it and to file
  any return.
- The buyer shows a 6-digit pickup code. The agent types it, sees the items to hand over, and marks
  them collected.
- Uncollected parcels stay with the agent with no time limit.

## Returns

- The buyer files a return online within the 48 hours. The factory decides within 24 hours, or an
  admin decides after the factory refuses or times out.
- Only after acceptance is the buyer told which agent to hand the item to. That agent sees the
  return parcel on their dashboard and sends it back with the factory's next courier.
- The buyer has 7 days to hand the item over. If they do, and the fault is the factory's, they get
  full-price tokens when the agent marks it collected. Otherwise the return is cancelled.
- Fault holds and quality reports stay.

## Money

- **GroupBasket pays cash only to factories.** Buyers and agents receive only tokens. There is no
  cash back for any reason.
- **Factories** earn each item 48 hours after the agent receives it, unless it has an open return.
  Earnings show on the factory dashboard. Everything earned by Saturday 11:59 pm is deposited to
  the factory's bank account every Sunday.
- **Agents** earn LKR 20 per item in tokens, plus courier repayments.
- **Late or duplicate PayHere payments** become the buyer's tokens.
- **Tokens** can be transferred by any user to any other user. Cash exchanged for tokens happens
  outside the platform and GroupBasket does not resolve disputes about it.
- The buyer price is the factory price plus commission (LKR 100 per piece by default).

## Agents

- Agents apply online with their NIC, their own photo, address and pin, and photos of the storage
  space. Admin checks the area rule and approves.
- An agent covers a 1 km radius, and no two agents can be within 2 km of each other.
- The agent pays a LKR 200,000 security deposit through PayHere. It stays locked while they are
  active and is returned as tokens, minus losses, when they leave.
- Agents get their own dashboard.

## Kept, parked and removed

- **Kept:** sign-in, accounts and pins; products and variants; the factory portal, onboarding
  checks and agreement; tokens; notifications; settings; quality reports, ratings and fault holds.
- **Parked, not deleted:** premium brands and gifts; factory design likes.
- **Removed:** buyer-run group baskets, join requests, merging, invites and discovery; bank slips
  and slip review; packing staff, warehouse, lots and price changes; samples; stock offers; owner
  chat; bank details in Settings.
- Old rules that conflict with this model are retired.

## Risks and unknowns

- **Margin:** on a LKR 1,000 item, GroupBasket keeps about LKR 80 after the agent's LKR 20,
  before any courier shortfall.
- **Outstanding tokens:** every token issued becomes cash paid to a factory when it is spent.
- **Token scams:** off-platform cash for token transfers can be abused.
- **Agent storage:** uncollected parcels can fill up an agent's space.
- **Slow areas:** baskets in quiet areas can take up to 2 months, which weakens the factory time
  promise.
- **PayHere:** the plan, fee rate, limits, refund rules and merchant approval for this model need
  written confirmation. The free plan caps payments at LKR 200,000 a month.
- **Agent pay:** agents may find LKR 20 per item in tokens unattractive against a LKR 200,000
  cash deposit.

## Next

Before planning, interview each role's dashboard: Agent, Buyer, Factory and Admin, contents first
and then layout.
