---
name: groupbasket
description: "Lead agent for GroupBasket. Canonical business model, scope, responsibilities and business rules, with links to implementation status, open decisions, architecture and specialist guidance. Read first for planning or work spanning domains."
---

# GroupBasket operating brief

## 1. Purpose and authority

This is the canonical project brief for GroupBasket's business model and product rules. Read it before planning or changing behavior. Last consolidated: **2026-11-08**, for the area agent model ([spec 003](../../specs/003-area-agent-model/spec.md), approved by the owner on 2026-11-07).

- Explicit user instructions govern the task, subject to the agent's system and developer instructions. Follow [AGENTS.md](../../AGENTS.md), including its Next.js documentation requirement.
- This brief defines current business intent. [Implementation status](../../docs/implementation-status.md) records what the code supports. Code that differs from an approved requirement is a gap, not a new policy.
- [Open decisions](../../docs/decisions.md) records unresolved questions. Do not invent an answer when it affects the requested work; progress on independent work and seek the missing decision.
- Specialist files provide technical guidance. Historical notes and the [changelog](../../docs/CHANGES.md) do not override this brief. Dates alone do not resolve contradictory requirements.
- Update each fact in its authoritative home and link to it elsewhere. Do not recreate another business-rule list in `CLAUDE.md` or specialist introductions.

**Policy and implementation are separate.** Rules below are established requirements unless marked **Planned**, **Parked**, **Paused** or **Open**. Planned means recorded business intent, not a working feature. Parked means hidden from users with its data kept. Recommendations and illustrative figures do not become policy automatically.

The rule IDs for buying, payment, baskets and delivery were rewritten for the area agent model on 2026-11-08. The retired IDs (`CART-*`, `INV-001`, `LOT-*`, `PAY-001`–`PAY-003`, `FUL-*`, `SAMPLE-001`, `COM-002`, `ADMIN-001`) are listed with their replacements in the [legacy mapping](../../docs/decisions.md#legacy-rule-references) and the [changelog](../../docs/CHANGES.md).

## 2. Business model

GroupBasket is a Sri Lankan clothing marketplace. Partner factories list their own clothes, keep the stock and pack it. Buyers pay upfront and collect from a nearby **area agent**. GroupBasket earns a fixed commission per piece (`commissionPerPiece`, LKR 100 by default) on top of the factory price. It does not buy or store stock.

### Area agents and baskets

Each paid order joins the chosen agent's open **basket** for that factory. A basket locks at the lock amount (LKR 50,000 of goods by default) or ships when its first order is two months old. The factory packs the locked basket, an admin books a courier from the factory to the agent, and the agent pays the driver and is repaid the booked fee in tokens. Buyers collect with a 6-digit pickup code.

The promise is low cost for buyers (one shared courier per basket) and fast stock clearance for factories, which are paid in cash every Sunday for items collected and past the return window.

### Money flows

- **Buyers** pay item price, a fixed courier charge per item, an agent fee per item and the PayHere fee on the part paid by gateway. Tokens apply first.
- **Factories** receive cash only: every Sunday, the factory price of payable items, minus deductions. Factory accounts and staff hold no tokens.
- **Agents** earn the agent fee per item and are repaid courier fees, all in tokens. Their deposit comes back as tokens when they leave.
- **No cash back.** Buyers and agents are never paid cash; late, duplicate and mismatched payments, cancellations, returns and missing items become tokens.

### Parked, paused and planned

- **Premium-brand rewards — Parked** (FR-034): brand workspaces, gift reservations and settlement are hidden; their data is kept. The `BRAND-*` and `GIFT-*` rules below describe the parked model and must not be rebuilt on baskets without an owner decision.
- **Design tests and likes — Parked** (FR-034): approved on 2026-11-07 but not built, then hidden by the area agent model. Factory design history (`SUP-003`) is parked with them.
- **Preorders — Paused, not built** (`DEC-015`): the owner paused only the preorder part on 2026-11-07. It is not approved policy and must not be built until the owner resumes it and answers Question 25.
- **Body measurements — Planned** (`FIT-001`).

## 3. Scope, identity and vocabulary

| Topic               | Boundary                                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary range       | Clothing and apparel.                                                                                                                                                                                                                                                              |
| Secondary range     | Factory surplus and B-grade clothing.                                                                                                                                                                                                                                              |
| Excluded range      | Shoes and footwear.                                                                                                                                                                                                                                                                |
| Premium gifts       | Parked. Brands would retain and directly fulfil gift stock, separate from clothing.                                                                                                                                                                                                |
| Geography and money | Sri Lanka; LKR; display dates and business days in `Asia/Colombo`. Weeks end Saturday 23:59:59 Asia/Colombo (fixed UTC+05:30).                                                                                                                                                     |
| Name                | The company and customer-facing name is **GroupBasket**. Always use GroupBasket in business references and `groupbasket` in technical names. The canonical brief is `groupbasket.md`; the npm package, agent and local databases use `groupbasket` (`groupbasket_test` for tests). |
| Independence        | Standalone code, database and rules. Do not import rules, prices or styling from unrelated projects.                                                                                                                                                                               |

**Cart** is a buyer's personal list of items; it reserves nothing. An **order** is one buyer's paid items from one factory, collected at one agent. A **basket** belongs to one agent and one factory and gathers paid orders until it locks. A **pickup code** is one buyer's 6-digit code at one agent. **Tokens** are LKR credits (1 token = LKR 1) that never expire. A **design** is a factory-linked product whose test and bulk share history (parked).

## 4. Participants and responsibilities

| Participant                            | Responsibilities and permitted information                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer (`CUSTOMER`)                     | Signs up, keeps an address and map pin, fills a personal cart, chooses an agent, pays, collects with the pickup code, files returns and rates collected products. Holds tokens and can send them.                                                                               |
| Area agent (`AGENT`)                   | Applies with NIC, photos, address and pin; pays the deposit to go live; sets weekly hours; pays couriers and marks baskets received; hands parcels over by code; collects returns. Holds tokens. Also shops as a buyer. A person cannot be a factory user and an agent at once. |
| Factory (`SELLER`, with `factoryRole`) | Admin-approved partner. Three jobs only (`FAC-001`): Owner, Sales and Packing. Lists products and stock, packs locked baskets, decides returns and is paid every Sunday. Sees agents' names and areas, never buyer names or phones. Holds no tokens.                            |
| Premium brand (`SELLER`, `isBrand`)    | Parked. Data kept; the workspace is hidden.                                                                                                                                                                                                                                     |
| Admin (`ADMIN`)                        | One area each (`ADMIN-002`): Agents and orders (`AGENTS`), Factory (`FACTORY`), Core (`CORE`) and Luxury brands (`PREMIUM`, parked). There is no unrestricted admin.                                                                                                            |

Role homes: buyers `/`, agents `/agent`, factories `/seller`, admins their area's admin home. Packing staff accounts and the `PACKER` role were removed; factory Packing staff do the packing.

## 5. Main journeys

| Journey         | Sequence                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Buy             | Cart → checkout (agent, prices, tokens) → gateway (or tokens only) → verified notice → order joins the agent's open basket for that factory.                                                                 |
| Basket to agent | Basket locks (amount, two months or agent suspended) → factory Packing checks lines and taps Packed → admin books the courier → Packing taps Given to driver → agent pays the driver and taps Mark received. |
| Collect         | Buyer gets an in-app notice with the pickup code → agent types the code → Hand over.                                                                                                                         |
| Return          | Buyer files within 48 hours of receipt → factory decides within 24 hours, else Factory admin → buyer hands the item to the agent within 7 days → tokens → item goes back with the next courier.              |
| Factory payout  | Items past the return window with no open return → weekly payout after Saturday 23:59 → Core admin pays and records the bank reference on Sunday.                                                            |
| Become an agent | Apply → Agents and orders admin approves (no clash within 2 km) → pay deposit → set hours → live.                                                                                                            |

These are summaries. Rule IDs below define behavior; the [architecture reference](../../docs/architecture.md) describes code and transitions.

## 6. Business rules

### Catalogue

- **CAT-001 — Availability:** ordinary products appear in listings/search while some variant has free stock. Product links still open without free stock. Removing free stock prevents further purchases without releasing existing holds. Draft/review/live/archive statuses are unused.
- **CAT-002 — Condition fields:** the current owner rule hides stock type and defect fields. Existing stock types are retained; new products are stored as `FACTORY_SURPLUS`. Legacy defect notes remain unused. Condition disclosure and after-sales exceptions are open (`DEC-005`), not permission to change behavior during unrelated work.

### Administrative workspaces

- **ADMIN-002 — Four admin areas:** every admin works in exactly one area, enforced in server pages, actions, private routes and services. **Agents and orders** (`AGENTS`, formerly `WAREHOUSE`): courier booking, payment problems, agent applications, deposits, suspension and losses, two-month baskets, order search and buyer accounts. **Factory** (`FACTORY`): factory applications and accounts, listings visibility, quality, returns decisions after refusal or timeout, and missing items. **Core** (`CORE`): weekly payouts, token reports, Settings and admin accounts; it also shares quality flags, hide/removal controls and private report photos with FACTORY under `DEC-013`. **Luxury brands** (`PREMIUM`): parked. No admin can reach another area's pages, actions, private files or money. The first admins of a deployment are created from the command line. Notices target only the responsible area.

### Buying and orders

- **ORD-001 — Personal cart:** a buyer puts items from any factory into one personal cart. The cart reserves no stock. Only buyer accounts (including agents shopping as buyers) can check out.
- **ORD-002 — Agent choice at checkout:** a buyer must have an address and map pin inside Sri Lanka before checkout (`LOC-001`). Checkout pre-selects the nearest live agent by distance from the buyer's pin and lets the buyer choose any live agent, showing its distance and weekly hours. A suspended, leaving or left agent cannot be chosen.
- **ORD-003 — Stock hold:** starting payment reserves stock for each line; a verified payment moves it to sold. The hold ends `paymentHoldMinutes` (15) after payment starts if no verified payment has arrived, releasing the stock and any held tokens. A payment verified after that becomes tokens (`PAY-006`). Never oversell.
- **ORD-004 — Cancel before lock:** a buyer may cancel a paid order while its basket is still open. Everything paid, including courier charge, agent fee and PayHere fee, comes back as `ORDER_CANCEL` tokens, the stock is released and the basket total falls. The basket's two-month clock moves to its earliest remaining paid order, or clears. After the basket locks, the order cannot be cancelled.
- **ORD-005 — Pickup code and handover:** each buyer has one 6-digit pickup code per agent, unique among that agent's codes, shown to the buyer. When an agent marks a delivery received, every buyer with items in it gets an in-app notice with that code. Typing the code shows every received, uncollected item of that buyer at this agent, across factories, with a Hand over button. A wrong code shows only that it was not found; five failed lookups in ten minutes block the agent briefly. Uncollected parcels stay with the agent with no time limit.
- **RETURN-001 — Returns through agents:** a buyer files a return for collected items within `collectHours` (48) of the agent receiving them, with reason, fault and photos (factory fault needs a photo). The factory's Owner or Sales decides within 24 hours; every refusal or timeout goes to a Factory admin, whose decision is final, with a private admin–factory thread. After acceptance the buyer is told which agent to hand the item to and has `returnHandoverDays` (7); otherwise the return lapses and the line earns for the factory again. When the agent collects it, the buyer gets tokens: the full item price for a factory fault, or the item price minus the courier charge for a buyer fault. Agent fee and PayHere fee are never returned. For a factory fault, the return courier charge is deducted from the factory's payout. The item goes back to the factory with its next courier for that agent, and the factory marks it received. Whether the agent checks an item's condition before buyer-fault tokens are credited is open (`DEC-016`). A proposal that buyer-fault returns are resold by the agent, with the buyer paid only after the resale, is open (`DEC-017`).

### Baskets and delivery

- **BSK-001 — One open basket:** each active agent has at most one open basket per factory. Only paid orders join it, and an order is never split. A new open basket starts when the previous one locks.
- **BSK-002 — Lock amount:** a basket locks automatically when its goods total reaches `basketLockAmount` (LKR 50,000). The order that crosses the amount joins whole. Courier charge, agent fee and PayHere fee do not count toward it (Claude's call, owner to confirm).
- **BSK-003 — Maximum wait:** a basket locks and ships when its first paid order is older than `maxWaitDays` (60). A suspended or leaving agent's open baskets lock early and ship.
- **BSK-004 — Factory packing:** factory Packing (or Owner) sees locked baskets with the agent's name and area and the lines by product, size and colour. Packing reports a missing line, then taps Packed. Packing never sees money.
- **BSK-005 — Courier booking:** an Agents and orders admin books each packed basket by hand, entering the courier fee and the driver's name, phone and vehicle. Packing records Given to driver; the agent then sees it in Arriving today with the fee to pay. After a failed trip Packing records Parcel is back and the admin rebooks. There is no courier provider integration.
- **BSK-006 — Receipt at the agent:** the agent pays the driver and taps Mark received. The agent is credited exactly the booked fee as `COURIER_REPAY` tokens, the orders become received, buyers get their pickup-code notice, and the return window starts for those items. Returns waiting at the agent go back with that courier.
- **BSK-007 — Missing items:** when Packing reports a line the factory cannot supply, a Factory admin either removes it or dismisses a wrong report. Removal gives the buyer full tokens (item price, courier charge and agent fee, not the PayHere fee) as `MISSING_ITEM`, and deducts GroupBasket's loss (commission plus the refunded courier charge and agent fee) from the factory's next payout. The factory price is never paid for that line.

### Payment

- **PAY-004 — Checkout prices:** checkout shows Item, Courier (`courierPerItem`, LKR 40 per item), Agent fee (`agentFeePerItem`, LKR 20 per item), Tokens, PayHere fee and Total. Tokens apply first. The PayHere fee is charged only on the remainder paid by gateway: `round2(remainder / (1 − rate) − remainder)`, with `gatewayFeeRate` 0.033, and 0 when the remainder is 0. LKR 1,000 item + 40 + 20 with no tokens gives a fee of **36.17** and a total of **1,096.17**. A fully token-paid checkout makes no gateway payment. One payment covers every factory's order from one checkout; the fee is shared across orders in proportion to their remainders.
- **PAY-005 — Verified gateway notice:** only a gateway notice whose signature, amount and currency are verified confirms a payment, once, even when the notice repeats. A browser return never confirms a payment; the return page shows Checking until the notice arrives. The first release uses a demo gateway that copies the PayHere flow (hosted page with Pay, Fail and Cancel, signed server notice, return page). Switching to PayHere must not change anything else, and waits for PayHere's written approval of this model (`DEC-016`).
- **PAY-006 — No cash back:** GroupBasket pays cash only to factories. Late, duplicate and amount-mismatched payments become the payer's `LATE_PAYMENT` tokens. There are no bank or cash refunds; unresolved after-sales exceptions stay in `DEC-005`.
- **PAY-007 — Weekly factory payout:** each item becomes payable `collectHours` (48) after the agent receives it if it has no open return. After Saturday 23:59 Asia/Colombo the payout totals each factory's payable items at the factory price, minus deductions (factory-fault return courier charges and missing items), listed on the statement. A Core admin pays by bank transfer on Sunday and records the bank reference; the factory Owner sees it in payout history. Items with an open return or an unresolved missing report are held. The commission stays with GroupBasket.

### Tokens

- **TOK-001 — Token ledger:** 1 token = LKR 1; tokens never expire and can be spent on the holder's own checkouts. Every entry has a type (late payment, order cancel, agent fee, courier repay, return, missing item, deposit return, transfers, holds) and is never changed or deleted. A balance can never go below zero. Factory accounts and factory staff hold no tokens.
- **TOK-002 — Transfers:** any token holder can send tokens to another token holder. The transfer is immediate, appears in both histories and cannot be undone. Transfers to factory users are refused. Admins take no action on cash deals made outside the platform.
- **TOK-003 — Token reporting:** a Core admin sees tokens issued by type and the total outstanding, which must equal the sum of balances.

### Agents

- **AGT-001 — Application:** applicants submit NIC, their own photo, address, map pin and storage photos. An Agents and orders admin approves or rejects. Approval is blocked within `agentGapM` (2 km) of an active agent; the application shows the clash. The service radius `agentRadiusM` (1 km) is for display.
- **AGT-002 — Deposit:** an approved applicant pays the `agentDeposit` (LKR 200,000) plus the PayHere fee by gateway to go live; tokens cannot pay it. The deposit stays locked while the agent is active. A late deposit payment becomes tokens.
- **AGT-003 — Opening hours:** each agent sets weekly days with open and close times. They show at checkout and on the buyer's pickup card.
- **AGT-004 — Suspension and leaving:** an Agents and orders admin can suspend an agent and lift the suspension. A suspended or leaving agent takes no new orders; its open baskets lock early and ship, and buyers keep collecting there. A leaving agent closes once every parcel and accepted return there has been handed over; the admin records any losses with photos and a reason, and the deposit minus losses comes back as `DEPOSIT_RETURN` tokens, never cash. Core admin reviews disputes.
- **AGT-005 — Agent earnings:** agents earn `agentFeePerItem` per item received, credited as `AGENT_FEE` tokens once per week after Saturday 23:59, plus the courier repayments under `BSK-006`.

### Location and communication

- **LOC-001 — Location:** buyer signup and checkout require an address and exact map pin inside Sri Lanka. Agents apply with a pin. Older accounts without pins must complete their profile before checkout.
- **COM-001 — Notifications:** in-app only; no email, SMS or WhatsApp. Notices are sent after the transaction commits. Time-based rules run only in the scheduled sweep (`runSweep`); page loads do not run it, so a deployment must schedule the cron (`DEC-016`).
- **COM-003 — Brand communication (Parked):** admins and premium brands use a separate partnership inbox linked to products, paid gift orders, settlements or general discussion. Brands see only their own shared history; internal admin notes never leave the admin workspace. Messages allow 2,000 characters and ten sends per minute, with per-user read markers, needs-reply/resolved states and deduplicated in-app notices.

### Suppliers, quality and visibility

- **SUP-001 — Factory supply:** factories list products, keep the stock, pack locked baskets and are paid weekly in cash under `PAY-007`. GroupBasket does not buy, store or price-drop stock.
- **SUP-002 — Listings:** a factory publishes its own listings without approval: title, brand, audience/category, its factory price, optional retail price, description, photo, and sizes with stock. The buyer price is the factory price plus the commission snapshotted when the listing is created (`commissionPerPiece`, CORE only). A listing shows in the shop once it has free stock; a Factory admin can hide any listing and show it again. Factories edit only their own listings and stock.
- **SUP-003 — Design history (Parked):** test and later bulk pieces share one product and its history. Parked with design tests and likes.
- **FAC-001 — Factory staff:** each person at a factory has their own login linked to the factory account with one fixed job: Owner, Sales or Packing (Planner work moved to Sales). The factory account itself is always an Owner; Owners add staff, change jobs and lock leavers. Packing sees Home and Orders (To pack, Courier booked). Sales sees Home, Products, Ratings, Returns and Baskets. Owners see everything, including Team and Earnings. Only Owners see money; whether Sales should see basket totals, and which tabs the Owner gets, are open (`DEC-016`). Actions record the person who did them.
- **FAC-002 — Factory joining and agreement (2026-11-05, `DEC-013`):** factory owners apply publicly or by seven-day, single-use admin invite. Submission requires BR number/certificate, owner NIC/photo, factory address/photo and bank details; rejected BR/NIC identities cannot reapply. FACTORY/CORE admins alone view private documents, record optional visits and review applications; approval requires an account name matching the business or owner. CORE publishes immutable agreement versions; the factory account records acceptance of the latest version for 12 calendar months. Listing, selling and staff creation require current unexpired acceptance; owners receive a reminder within 30 days of the term ending. Agreement expiry hides new sales and stops listing while paid orders continue.
- **RATE-001 — Product ratings:** a buyer who has collected a line of a product can rate it once per order, 1–5 stars. Ratings of 1–2 require a report; DAMAGED, WRONG_ITEM and STITCHING reports require a photo. Photos are private to the rater and FACTORY/CORE admins. A factory's score is the average of its product ratings (the old cart-keyed factory ratings were dropped in Task 18). Ratings cannot be edited or removed.
- **QUAL-001 — Manual quality action (DEC-013):** product flags mean average below 3 over 10+ ratings or 3 reports in the last 30 days; factory flags mean below 3 over 20+ combined ratings or 3+ flagged products. Flags are computed on demand and never act automatically. FACTORY/CORE admins hide products or remove a factory with a reason. A hide stops new sales. What a hide, hold or removal does to paid orders already in baskets is not set by the area agent spec and is open (`DEC-016`); do not reuse the retired cart cleanup. Factory removal locks owner and staff and ends sessions, hides all products and never notifies factory users. Earnings may be marked held with a note.
- **FAULT-001 — Factory fault limit (DEC-013):** each unit of an accepted FACTORY-fault return records a fault. Uncancelled faults from the last 12 calendar months count. At 2 units an open hold blocks selling and hides listings. Owners and FACTORY/CORE admins are notified and talk in a private hold thread (not Sales): 1–1000 characters, ten messages per minute per author. Admins decide Continue or Remove with a 1–2000 character note. Continue restores only listings the hold hid and faults keep counting. Admins may cancel a mistaken fault with a note.
- **DATA-001 — Commercial visibility:** factories see their own listings, sales, baskets (agent name, area and totals), returns and payouts, never buyer names, phones or other factories' records. Packing sees no money. Agents see the items and pickup codes of their own parcels, never prices beyond the courier fee they pay and their own tokens. Buyers see their own orders and their basket's progress. Internal commission records and other users' tokens stay private. City figures appear only for cities with 5 or more orders, and a factory sees its average rating only from 5 ratings.

### Premium rewards (Parked) and personalization

Premium-brand rules are kept for the parked data and for any future restart. They are not active: the brand workspace and gift routes are hidden and nothing reserves gifts on baskets. Restarting them needs an owner decision on how gifts attach to agent orders (`DEC-001`–`DEC-004`).

- **BRAND-001 — Distribution:** premium products are complimentary gifts fulfilled directly by the brand after verified clothing payment. GroupBasket does not purchase or hold premium gift inventory. No standalone discounted public sale. Present genuine retail value and keep partner pricing private.
- **BRAND-002 — Offers:** brands submit a product photo, gift contents, size/weight/volume, dispatch time, genuine retail value, private partner price, quantity available and an HTTPS product link on their own website. Submission alone does not authorize a campaign.
- **BRAND-003 — Weekly settlement:** an authorized gift becomes a bill at its snapshotted partner price. An admin approves bills and records external Sunday transfers against selected bill IDs and a bank reference. The app prevents duplicate settlement.
- **BRAND-004 — Partnership reviews and reconciliation:** submissions have immutable revision snapshots and named review events. Approved terms stay live until a new revision is approved; existing gift price snapshots never change.
- **GIFT-001 — Spending unit (Planned):** no automatic host gift. Family and individual qualification remain open (`DEC-002`).
- **GIFT-002 — Qualification (Planned; details Open):** gift threshold, inclusive or strict comparison, tiers and overlaps remain open (`DEC-003`/`DEC-004`).
- **GIFT-003 — Direct fulfilment:** each gift snapshots its retail value, private partner charge and recipient details; the brand ships it and records courier, delivery and issues. Customers pay separate gift delivery.
- **FIT-001 — Measurements (Planned):** approximate height, shoulder width and other dimensions personalize size recommendations. Details remain open (`DEC-006`). Do not promise exact fit.

### Product interface

- **UX-001 — Concise screens:** titles, data and actions without page descriptions or explanatory-flow text. Success uses `flash()`/`FlashToast` pop-ups; inline `Alert` is for errors. Every screen works at 360 px and by keyboard. This interface rule does not limit agent documentation clarity.
- **UX-002 — Role homes, most important first:** Buyer: Ready to collect, Return to hand over, My orders with basket progress and Share basket, Tokens, Shop. Agent: Hand over, Arriving today, Waiting for pickup, Returns to collect, Open baskets, Tokens. Factory Packing: To pack, Courier booked. Factory Sales: Filling baskets, Returns waiting, Products and stock. Factory Owner: everything plus Earnings and payouts. Admin Agents and orders: Courier to book, Payment problems, then Applications, Deposits, 2-month baskets, Search. Admin Factory: existing workspace plus Missing items. Admin Core: Payouts first, then Tokens, Settings and Admins. How agents reach their own sections alongside the buyer tab bar is open (`DEC-016`).

## 7. Implementation status

Read [implementation-status.md](../../docs/implementation-status.md) before claiming a capability exists. It owns the evidence-based inventory of implemented, partial, missing and parked behavior. Static inspection is not a claim of deployed service, successful tests or commercial readiness.

## 8. Open decisions

[decisions.md](../../docs/decisions.md) owns unresolved questions and their reasons. Resolve only those needed for the task; do not block unrelated work. When the owner decides, update the rule here, the decision record, affected implementation guidance and the changelog together.

The register covers the area agent model's open owner questions (`DEC-016`), premium distribution, family identity, gift qualification, after-sales exceptions, fit recommendations, seller geographic insights, launch dependencies and paused preorders. Business-review suggestions are not approved policy.

## 9. Architecture and specialist ownership

Use [architecture.md](../../docs/architecture.md) for the data model, lifecycle, routes, services and deployment dependencies. Code is the evidence for current implementation; this brief does not duplicate exhaustive technical tables.

| Specialist                            | Responsibility                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| [backend-data](backend-data.md)       | Schema, migrations, seed and persistence.                                         |
| [orders-baskets](orders-baskets.md)   | Cart, checkout, orders, baskets, stock holds, pickup codes, handover and returns. |
| [payments](payments.md)               | Gateway adapter, verified notices, late payments, tokens and weekly payouts.      |
| [agents](agents.md)                   | Agent applications, deposits, hours, suspension, leaving and agent screens.       |
| [courier](courier.md)                 | Factory packing, missing items, manual courier booking and receipt at the agent.  |
| [notifications](notifications.md)     | In-app notices and partnership communication.                                     |
| [catalogue-admin](catalogue-admin.md) | Clothing catalogue, stock, factory listings and general admin.                    |
| [brands-rewards](brands-rewards.md)   | Parked brand reviews, gift reservations, direct fulfilment and settlements.       |
| [frontend](frontend.md)               | Role-specific pages, components and mobile interaction.                           |
| [qa-review](qa-review.md)             | Rule verification and appropriate test coverage.                                  |

## 10. Engineering and verification standards

Shared engineering standards and documentation-maintenance instructions live in
[AGENTS.md](../../AGENTS.md#engineering-standards). Follow them for every domain;
specialist files add domain-specific implementation guards and verification pointers.

The [QA brief](qa-review.md) maps changes to appropriate checks. This brief owns business
policy rather than a second copy of repository workflow.

## 11. Supporting documentation

| Document                                                       | Authoritative purpose                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| This brief                                                     | Business model, scope, rules and responsibilities.                 |
| [AGENTS.md](../../AGENTS.md)                                   | Repository workflow, engineering standards and specialist routing. |
| [CLAUDE.md](../../CLAUDE.md)                                   | Short entry point directing agents here.                           |
| [Area agent spec](../../specs/003-area-agent-model/spec.md)    | Approved requirements FR-001 to FR-036 for the current model.      |
| [Implementation status](../../docs/implementation-status.md)   | Code evidence and feature gaps.                                    |
| [Decisions](../../docs/decisions.md)                           | Open decisions and legacy rule mapping.                            |
| [Architecture](../../docs/architecture.md)                     | Technical reference and code pointers.                             |
| [README](../../README.md) / [package.json](../../package.json) | Setup and executable commands.                                     |
| [Changelog](../../docs/CHANGES.md)                             | History, not competing current policy.                             |

Keep rule IDs stable. Reference IDs and named topics rather than section positions or old numbers; the [legacy mapping](../../docs/decisions.md#legacy-rule-references) preserves older references.

## Login rate limiting

- **AUTH-001 (2026-11-05):** password sign-in counts consecutive failures per trimmed, lower-case email, including unknown emails. The fifth failure locks that email for ten minutes. Active locks refuse before password verification with the same message for every email and are not extended by refused attempts. The first attempt at or after expiry starts at zero; successful sign-in clears the counter. Wrong passwords count even for administratively locked users; their correct-password support message remains. Unknown unlocked emails retain dummy-hash timing protection.
