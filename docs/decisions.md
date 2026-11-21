# Business decisions and unresolved questions

Consolidated on **2026-10-24** from the existing brief and business-model review; updated on **2026-11-08** for the area agent model ([spec 003](../specs/003-area-agent-model/spec.md)). The [main agent brief](../.claude/agents/groupbasket.md) owns established policy. This register separates open questions from approved requirements; it does not authorize new features or commercial commitments.

## Decision procedure

1. Check whether the owner has already resolved the question in the current session.
2. Otherwise, ask only when the decision is needed for the requested work; continue independent work.
3. Record the owner's actual decision, date and reason here. Update the corresponding stable rule ID, implementation status and affected specialist guidance, and add a changelog entry.
4. A decision can be approved before implementation. Do not mark a capability implemented until code and verification support that claim.

Examples and business-review recommendations are not approved settings. The repository does not prove a supplier agreement, partner endorsement or live deployment.

## Open decisions

### DEC-016 - Area agent model: open owner questions

**Status:** Open. The area agent model itself was approved by the owner on **2026-11-07**
([spec 003](../specs/003-area-agent-model/spec.md)). **Rules:** `UX-002`, `FAC-001`,
`RETURN-001`, `PAY-005`, `COM-001`, `DATA-001`, `BSK-004`, `BSK-005`.

These questions came up while building it. Each is built one way for now; the owner has not yet
answered.

1. **Agent navigation.** Agents are buyers too, so they keep the buyer phone tab bar and reach
   their agent sections through an in-page tab row on `/agent`, not a second bottom bar (two fixed
   bars collide at 360 px). Confirm, or merge agent sections into one bar.
2. **Factory Owner tabs and Sales money.** The Owner has no Baskets or Earnings tab (the phone bar
   is full); earnings and past payouts are reached from the Owner's Home. Sales sees basket totals
   against the lock amount, although only Owners otherwise see money. Decide which tabs the Owner
   gets and whether Sales may see those totals.
3. **Condition check on buyer-fault returns.** Tokens are credited when the agent collects the
   item (`collectReturn`); nobody checks whether a buyer-fault item is used or untagged first. The
   earlier used/untagged admin review was not carried into the agent model. Decide whether the
   agent checks an item's condition before buyer-fault return tokens are credited.
4. **PayHere's written approval.** The first release uses the demo gateway. Switching to PayHere
   needs PayHere's written approval of this model (tokens, agent deposits, fee passed to the
   buyer) before going live.
5. **Cron in production.** Every time-based rule (order expiry, maximum-wait locking, return
   escalation and lapse, closing leaving agents, weekly payouts and agent fees, notice retries)
   runs only in `runSweep` from `/api/cron/sweep`; page loads do not run it. A deployment must
   schedule the cron to run `runSweep` with its bearer secret, or none of these happen.
6. **Packing checklist and photo, and Parcel is back (FR-013, FR-014).** Neither is built:
   `markPacked` saves no checklist and needs no photo, and nothing sets
   `CourierBooking.failedAt`, so a failed trip leaves the basket `WITH_COURIER` with no rebooking
   (and a leaving agent with such a basket never closes). Decide whether launch needs them.
7. **Later charges and `payment_id` before PayHere.** Every further SUCCEEDED notice with a new
   `payment_id` is credited as tokens, but the PayHere-style signature does not cover
   `payment_id`. Before the PayHere switch, decide whether such charges are confirmed through
   `Gateway.fetchStatus` (or held for admin review) rather than trusted from the notice.
8. **Basket totals on the agent home (`DATA-001`).** `DATA-001` says agents see no prices beyond
   the courier fee and their own tokens, but `/agent` shows each open basket's total against the
   lock amount. Decide whether agents see basket totals (then reword `DATA-001`) or only progress.
9. **Paid baskets of a removed factory.** Removing a factory locks every login there, including
   Packing, so its paid baskets cannot be packed and stay stuck. Decide what happens to them
   (together with the hide and fault-hold question below).
10. **Map tiles and the applicant's pin.** The location picker loads tiles from
    `tile.openstreetmap.org`, which sends the area of the applicant's pin to OpenStreetMap. The
    tile layer sets the "© OpenStreetMap contributors" attribution; the tile usage policy also
    limits heavy use. Accept the public tiles (and confirm the attribution shows on every map), or
    self-host or buy tiles.

Also awaiting the owner's check (Claude's calls in the
[design](superpowers/specs/2026-11-07-area-agent-model-design.md)): the LKR 50,000 lock counts
goods only; one payment and one PayHere fee per checkout across factories; and what a quality hide, fault hold or factory removal does to paid orders
already in baskets (the cart-era cleanup does not apply).

### DEC-001 — Premium-brand distribution boundaries

**Status:** **Parked** with premium brands under the area agent model (FR-034): hidden, data kept. Distribution model resolved by the owner on **2026-10-25**; partner terms remain open. **Rules:** `BRAND-001`, `BRAND-002`, `BRAND-003`, `GIFT-003`.

The owner clarified that GroupBasket does not purchase or hold premium-brand stock. After the customer pays for a qualifying clothing purchase, GroupBasket authorizes a complimentary gift; the premium brand ships it directly to the customer. GroupBasket pays the brand at the agreed discounted partner price and settles outstanding gift bills every Sunday, using `Asia/Colombo` dates.

This replaces the earlier purchase-and-store model. Gifts are complimentary; no discounted resale exception is authorized. The rebuilt workspace excludes brands from factory receiving and shop-product linking; see [implementation status](implementation-status.md).

The owner's example uses clothing spend around LKR 20,000, factory cost LKR 10,000, gift retail value LKR 5,000 and a 30% partner discount, producing a LKR 3,500 brand bill. These are illustrative economics, not universal settings or confirmed partner agreements. Brand-specific prices, campaign duration/quantity and presentation terms remain unagreed. Brand-price protection is an objective, not a guarantee.

### DEC-002 — Family spending-unit identification

**Status:** Open, parked with premium brands. **Rule:** `GIFT-001`.

Recorded intent permits a family cart or family subgroup in a mixed cart to combine spending. Unrelated members qualify individually; ownership alone earns no gift.

Define household identification, shared-address evidence, unrelated co-residents, address changes and membership in more than one family unit. The common cart delivery destination cannot establish family membership because every member's items already go to the owner. Do not silently introduce identity documents, verification services or a household schema as settled requirements.

### DEC-003 — Gift threshold and duplicate qualification

**Status:** Open, parked with premium brands. **Rule:** `GIFT-002`.

The original wording mixes "above/crosses" (with `> LKR 20,000` examples) and "reaches." Decide strict `>` versus inclusive `>=`, actual thresholds, the spend basis, tiers, whether individual/family awards can overlap, and whether qualification is per order or cumulative. LKR 20,000 is illustrative, not a configured default. Gift qualification remains separate from the cart checkout minimum.

### DEC-004 — Brand fulfilment, weekly billing and campaign economics

**Status:** Parked with premium brands. Direct brand delivery and Sunday settlement approved on **2026-10-25**; operating details open. How gifts would attach to agent orders is undecided. **Rules:** `GIFT-002`, `GIFT-003`, `BRAND-003`.

Owner clarification on **2026-10-25**: a gift in an unpaid basket reserves quantity and reduces availability. Verified clothing payment is required before the brand may dispatch it. The customer pays the gift's separate delivery. The brand ships directly to the eligible customer and GroupBasket settles approved gift bills each Sunday. Owned gift inventory and staff gift packing are no longer requirements.

Current implementation uses explicit admin eligibility/recipient assignment, with one active gift per recipient/basket as a duplicate guard. Brands see only reserved totals before payment, then the gift recipient's delivery details. Removal, leaving, cancellation and expiry release reservations; clothing quantity reductions release that recipient's gift for manual eligibility reassessment, and merges preserve it. This does not resolve automated threshold, overlapping household awards or customer gift selection.

Gift delivery cost responsibility is resolved: the customer pays. The fee amount, quote acceptance and collection method remain open. Also decide dispatch deadlines, stock-outs/substitutions, failed delivery, damaged gifts, replacements and post-payment cancellations. Billing is manually approved before an admin records a completed external transfer; an automatic billing trigger, Sunday cutoff and dispute/credit handling remain open. No bank or courier automation or specific refund terms are approved by this entry.

Gift cost reduces the contribution from clothing. Campaign budgets, profit floors, quantity caps and other commercial controls require owner decisions. These were review recommendations, not existing rules. No default gift budget has been approved.

### DEC-005 — Condition disclosure and after-sales exceptions

**Status:** Open exception policy. **Rules:** `CAT-002`, `PAY-006`.

Current recorded scope hides stock-type/defect fields. Returns through agents (`RETURN-001`) and missing items (`BSK-007`) credit tokens; there is no cash refund. Preserve those instructions until changed. Resolve product-condition disclosure, quality/fit complaints, incorrect/damaged items, and a parcel lost between factory and agent. Late, duplicate and mismatched gateway payments are settled: they become tokens (`PAY-006`).

Reservations prevent overselling; they do not answer these cases. This entry neither introduces a refund entitlement nor approves a new blanket refusal policy. Changes require a concrete business decision and corresponding implementation.

### DEC-006 — Measurement-based recommendations

**Status:** Partly decided **2026-11-15** in `DEC-020`. **Rule:** `FIT-001`.

Still open: required versus optional measurements beyond height, how long a body profile is
kept, and calibration targets for the tension constants. Approximate dimensions alone do not
justify exact-fit promises.

### DEC-007 — Geographic seller insights

**Status:** Open. **Rules:** `SUP-003`, `DATA-001`.

Earlier design-dashboard notes leave district-level insights undecided. Confirm whether suppliers should receive geographic aggregates and how to preserve buyer privacy before introducing them. Permission for buyer counts does not authorize names, addresses or individual carts.

### DEC-008 — Deployment and provider dependencies

**Status:** Unresolved launch dependencies, not new business policy.

- Choose hosting and durable upload storage; local-disk uploads need a persistent filesystem or object-storage implementation.
- The PickMe provider and webhook are removed; admins book couriers by hand (`BSK-005`).
- Obtain PayHere's written approval and merchant credentials before replacing the demo gateway (`DEC-016`).
- Schedule `/api/cron/sweep` with its secret; `runSweep` is the only place time-based rules run (`DEC-016`). Factory payouts are bank transfers made outside the app and recorded by Core admin.

Use [architecture](architecture.md) and [README](../README.md) for technical details. This register does not authorize deployment or external-account actions.

### DEC-009 - Pre-purchase group samples

**Status:** **Retired** by the area agent model (FR-033, 2026-11-07): samples are removed. Approved on **2026-10-27**; kept for history. **Rule:** `SAMPLE-001` (retired).

Groups may request a sample of a particular apparel design/pattern before buying as a group. GroupBasket delivers the sample to the group, charges no sample sending fee, and the group pays transport. This does not mean factory test pieces or premium gifts. The implementation coordinates requests through the group owner and records explicit acceptance of the transport quote before dispatch; bank/courier operations remain external. Sample ownership, returns, loss/damage terms and any transport collection mechanism remain open; do not invent deposits, automatic charges or return obligations.

### DEC-010 - Factory-direct fulfilment

**Status:** Approved by the owner on **2026-11-03**; **superseded** on 2026-11-07 by the area agent model, which keeps factory packing but ships baskets to agents. **Rules:** `SUP-001`, `SUP-002`; `FUL-001`–`FUL-003` and `LOT-001` retired (see `BSK-004`–`BSK-006`).

GroupBasket no longer buys clothes from factories. Each factory packs its paid orders and marks them packed; the admin books the courier from the factory. A cart holds products from one factory only. There is no lot price drop. Packing staff are parked, not deleted, behind `FULFILMENT_MODE` (default `FACTORY`). Open: how our own listings (products with no factory) are fulfilled, factory payment terms, and who answers for a parcel lost between factory and owner.

### DEC-011 - Four admins, self-publishing factories and ratings

**Status:** Approved by the owner on **2026-11-03**; the buyers area became Agents and orders (`AGENTS`) and Core gained payouts and token reports under the area agent model. **Rules:** `ADMIN-002`, `SUP-002`, `DATA-001`, `RATE-001`.

Four admins: luxury brands, factories, buyers, and a core admin who handles only settings and admin accounts. Factories publish listings without approval and see a sales dashboard. Members rate the factory 1–5 stars once after delivery, and products show the factory name and rating. Open: whether ratings need moderation, replies or written reviews, and whether factories may see individual low ratings.

### DEC-012 - Factory roles, payouts and feedback

**Status:** Approved by the owner on **2026-11-04**; staff logins built. Under the area agent model Planner merged into Sales (three jobs), payouts are weekly on Sunday (`PAY-007`) and admin books the courier (`BSK-005`); PickMe and design drafts are gone or parked. **Spec:** [factory dashboard](factory-dashboard-spec.md).

Factories get one login per person with fixed roles (packing, planner, sales, owner; several owners allowed; only owners see money). GroupBasket keeps a commission of **LKR 100 per piece** and pays each order to the factory **after delivery by bank transfer**, recorded with the bank reference. Packing staff book PickMe from the factory (API, with a manual fallback); the cart owner still pays the driver. Design drafts collect interest, stars, comments and votes before publishing. Public comments, questions and replies post at once and are hidden by an admin when reported; factories never contact buyers directly. Open: refunds or chargebacks after a payout, and what happens to interest when a draft is dropped.

**Packing correction approved on 2026-11-06, not built yet:** admin books PickMe (`FUL-001`), so Packing booking and the parcel size choice are dropped. Admin enters the PickMe reference, driver name, phone and vehicle number. Packing or Owner records Given to driver after booking, and Packing records Parcel is back after a failed drop. Checklists, design drafts and likes are in the factory dashboards rebuild; preorders are paused (`DEC-015`). Payouts, inbox and chat are still to be decided. [Brief](../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-06/brief.md).

### DEC-013 - Factory partnership: checks, agreement, quality, tokens and returns

**Status:** Approved by the owner on **2026-11-05**; Parts 1–4 implemented. Under the area agent model, tokens, returns, ratings and fault holds moved from cart lines to order lines; returns go through agents (`RETURN-001`), and the zero-due cart rule and PickMe return pickups are retired. **Spec:** [factory partnership](../specs/001-factory-partnership/spec.md). **Brief:** [brief](../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-04/brief.md).

Factories join by public application or admin invite and must pass checks (BR number and certificate, owner NIC and photo, address and photos, bank account matching business or owner; visit optional). Rejected businesses cannot reapply. Only the owner or manager is onboarded; they add staff after accepting the in-app agreement (versioned, 12-month term, reminder 30 days before, listings hidden on expiry). Existing factories get 30 days to comply. Private documents: Factories admins and core admin only. Buyer price is factory price plus commission (LKR 100 default, core admin only, new listings only) — this replaces the "sale minus LKR 100" model in `DEC-012`. Ratings are per product (1–2 stars need a report, photo for visible defects); old factory ratings count equally. Rating flags never act automatically. Ordinary hides affect only OPEN/READY carts; holds/removal use the pre-booking cleanup below. Cancellations and accepted returns give **tokens** (1 token = LKR 1, full price paid, never expire, spendable only on the holder's own items in any cart, returned if a cart is not paid); no cash refunds (`PAY-003` kept). Returns: apply within 2 days of delivery; factory answers within 24 hours for new returns or it goes to an admin; every factory refusal goes automatically to admin review; admin final (updated 2026-11-06). Factory fault: factory pays PickMe pickup; buyer fault: buyer pays, item unused with tags. The agreement may allow withholding earned money after a quality removal, subject to lawyer review.

**Zero-due owner rule approved on 2026-11-05:** when tokens cover the whole cart and
`amountDue` is exactly LKR 0.00, the owner's acceptance confirms it immediately. There is no
bank slip, payment deadline or admin review. Acceptance spends token holds, moves reserved
stock to sold, activates gifts with their brand events, and sends the usual confirmation and
fulfilment notices after commit. Delivery details and acceptance/confirmation timestamps are
captured together. Any positive amount, including LKR 0.01, retains the bank-slip flow.

**Returns rebuild and fault limit approved on 2026-11-06:** factory owner/SALES and FACTORY/CORE
admins are notified at filing. Admins can view immediately but decide only WITH_ADMIN after
refusal/timeout. New returns have a 24-hour deadline; existing returns retain factoryDueAt.
Timeout alone is never a fault. Each unit of an accepted FACTORY-fault return counts at acceptance
by the factory or admin, including an admin acceptance after receipt. Uncancelled faults strictly
newer than 12 calendar months back count. The 2nd unit opens a hold and blocks selling, while
sign-in, returns and return threads stay available.

An ordinary product hide changes only OPEN/READY carts through normal stock/token/gift release
and Done reset. Finished carts stay unchanged, including at confirmation. Holds/removal remove
OPEN/READY lines, cancel AWAITING_SLIP/SLIP_REVIEW carts unpaid (applied tokens returned, no new
credit), and cancel CONFIRMED carts with full captured-price tokens per owner. DISPATCHED means
PickMe booked: BOOKED, PICKED_UP, FAILED and DELIVERED carts remain untouched. Paid cancellation
preserves payment totals and reduces sold without restocking availability.

Owners see faults and get hold notices; FACTORY/CORE admins are alerted. Their private hold
thread allows 1-1000 characters and ten messages per minute per author, posting while open and
readable afterwards. SALES and other outsiders cannot access it. Admins decide Continue or
Remove with a 1-2000 character note. Continue restores only products this hold hid; cancelled
carts stay cancelled and old faults keep counting, so the next fault can reopen a hold.
Remove uses normal removal, closes outstanding holds and locks staff without a removal notice.
Removed factories cannot open holds. An admin may cancel a mistaken fault with a required note;
it stays in history and stops counting, without automatically closing the hold.

**Return follow-ups approved by the owner on 2026-11-06:** every factory refusal goes
automatically to WITH_ADMIN, including a buyer-fault item received used or without tags.
The factory owner/SALES must give a reason of 1–1000 characters; receipt records its condition
and receivedAt without tokens. There is no buyer escalation action or appeal deadline.
FACTORY/CORE admins discuss the case privately with factory owner/SALES in the return thread;
buyers and other factories/jobs/admin areas cannot read it. Posting is permitted only while
WITH_ADMIN, limited to 1000 characters and ten messages per minute per user. The thread stays
readable to authorized participants after the decision, and messages notify the other side.

The admin accepts or rejects with a required note. Acceptance after receipt completes the
return with one full-price RETURN credit; acceptance before receipt follows normal fulfilment.
Rejection is final. If a pre-approved buyer-fault item subsequently arrives used or without
tags, that newly recorded receipt automatically reopens WITH_ADMIN for one final admin
decision, with no credit until acceptance. Repeated receipts and decisions are refused.

**No sending before approval, approved 2026-11-06:** the buyer keeps the item until a factory
or admin accepts. Pickup booking and receipt require acceptance; waiting status shows
"Waiting for approval" and offers no sending/pickup step. Buyer-fault delivery is arranged
and paid by the buyer; factory-fault PickMe pickup remains externally booked and factory-paid.

### DEC-014 - Member done before cart finish

**Status:** **Retired** with group carts (FR-033, 2026-11-07). Approved on **2026-11-05**; kept for history. **Rule:** `CART-006` (retired).

Every non-owner member with clothing lines must mark their own share Done before owner acceptance.
The owner needs no separate Done; empty members do not block. Done is reversible while the cart
is editable and unexpired, and share changes (lines, tokens, gift reservations) reset it. Joins
and incoming merges start not done. An owner may remove a not-done member, releasing all their
reservations and recomputing the cart minimum. Done members and the owner cannot be removed.
Removal is notified after commit and does not block rejoining. The owner receives Everyone is
done only on each transition to all required members done; Undo followed by Done permits a new
notice. Existing post-accept immutability, payment and token rules continue unchanged.

### DEC-015 - Preorders: not completed

**Status:** **Paused by the owner on 2026-11-07. Not completed, not approved policy and not built.** Still paused under the area agent model; resume only from this record and Question 25.
Do not build it or change an approved rule because of it. **Notes:**
[parked notes](../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-06/preorder-parked-notes.md).

Only the preorder part is paused: the factory takes preorders before sewing, buyers pay with tokens
from a deposit of at least LKR 20,000, keep items in a personal Preorder basket, and later move
ready items into a normal basket, and the factory is paid when its target is reached. The rules it
would touch are now `PAY-004`–`PAY-007`, `TOK-001` and `SUP-001`; they stay as written until the
owner resumes this. Open questions, including
Question 25 and legal review, are in the notes.

**Approved on 2026-11-07 alongside the pause, then overtaken the same day:** many baskets per buyer
(`CART-003`) and a 3-day basket lifetime (`CART-002`) were retired by the area agent model; design
tests with likes are **parked** (hidden, not built, not deleted).

### DEC-017 - Buyer-fault returns resold by the agent

**Status:** Decided **2026-11-14**, built **2026-11-15**. The owner set the rules; Claude settled the
smaller points at the owner's request (marked _settled_). **Rules:** `RETURN-001`, `PAY-007`,
`AGT-004`, `DATA-001`, `FAULT-001`.

The owner first proposed 80% tokens now or the full amount after resale, then dropped all tokens.
BMAD, Spec Kit and Superpowers reviews found the company carried the loss when an item never sold,
which led to these rules:

1. **Fault chosen at filing.** The buyer marks a return factory fault or buyer fault. A buyer-fault
   return never becomes a factory fault.
2. **Factory fault, changed.** Factory-fault returns follow `RETURN-001`. A Factory admin who finds
   one is really the buyer's fault changes it to buyer fault; no fault is recorded (`FAULT-001`),
   and the Agents and orders admin is notified and decides it as a buyer-fault return.
3. **Buyer-fault flow.** The buyer requests with one reason (Material not as expected, Size, Colour,
   Quality feel, Changed mind, Other) and a short note; photos optional (_settled_). The Agents and
   orders admin accepts or refuses, oldest first, with no deadline (_settled_). On acceptance the
   agent and buyer are notified, and the buyer has 2 days to hand the item to the agent.
4. **No company money.** GroupBasket gives no tokens. The factory is paid for the sale as normal;
   buyer-fault returns do not hold the payout or reduce the paid quantity.
5. **Resale.** The agent resells at the price the buyer paid (for example LKR 1,000), keeps the
   commission share (LKR 100) and gives the buyer the factory price (LKR 900), privately between
   them. Before filing, the buyer sees the amount they get when it sells. For its own held items
   only, the agent sees the price and the buyer's share, an exception to `DATA-001` (_settled_).
6. **End states.** Refused, Not brought (2 days passed, from the sweep), Sold and Taken back (the
   buyer collected it unsold), the last two marked by the agent. An agent cannot close while
   holding one (`AGT-004`).
7. **History.** Reasons, notes and outcomes per product and factory are visible to the Agents and
   orders admin and the Core admin only.

### DEC-018 - Courier and agent fees as a percentage

**Status:** Decided **2026-11-14**, built **2026-11-15**. _Settled_ marks Claude's calls at the owner's
request. **Rules:** `PAY-004`, `BSK-006`, `BSK-007`, `AGT-005`, `RETURN-001`, `PAY-007`.

1. **One 5% agent fee.** The fixed courier charge (LKR 40) and agent fee (LKR 20) per item become
   one agent fee of `agentFeeRate` (0.05) of the item price, rounded to 2 decimals per item and set
   by a Core admin (_settled_). LKR 1,000 item: fee 50, PayHere fee 35.83, total **1,085.83**. The
   PayHere fee stays 3.3%. Orders already placed keep the fees they paid (_settled_).
2. **The agent gets all of it** as `AGENT_FEE` tokens weekly, and pays every courier from the
   factory to the agent. Admins still book couriers; the booked-fee repayment (`COURIER_REPAY`)
   ends. No minimum: small baskets are the agent's risk.
3. **Factory-fault return courier:** the factory pays the driver when the parcel arrives; nothing
   is deducted from its payout. If it refuses the parcel, the agent reports it and the Factory
   admin follows up (_settled_).
4. **Refunds** (_settled_): cancel before lock still returns everything paid, including the 5% fee
   and the PayHere fee (`ORD-004`); a missing item returns the item price and the 5% fee, and
   GroupBasket's loss (commission plus that fee) is deducted from the factory; a factory fault
   returns the item price and the 5% fee, not the PayHere fee (owner), and the fee is taken back
   from the agent: not credited if the weekly fee has not been paid yet, otherwise deducted from
   the agent's tokens, with any shortfall taken from its next weekly fees, since a balance can
   never go below zero (_settled_); a buyer fault returns nothing.
5. **Leaving with a take-back owed** (_settled_ at build): any fee take-back still owed when a
   leaving agent closes comes off the deposit returned, never below zero.

### DEC-019 - Agent fee paid in cash at pickup

**Status:** Decided **2026-11-15**, built **2026-11-15**. **Rules:** `PAY-004`, `AGT-005`,
`ORD-005`, `RETURN-001`. Replaces the online fee of `DEC-018` for new orders.

The owner decided that buyers no longer pay the courier and agent fee on the website; they pay
it in cash to the agent when they collect. On a factory-fault return the factory is charged the
fee and the buyer gets it back with the item price. The owner asked Claude to settle the rest:

1. **The fee** stays 5% of the item price (`agentFeeRate`), rounded to the whole rupee per piece
   because it is cash. It is stored on each order line (`cashFeeEach`).
2. **Online payment** is the item price less tokens plus the PayHere fee. LKR 1,000 → PayHere
   34.13, online **1,034.13**, plus **LKR 50 at pickup**. Tokens cannot pay the fee. The buyer
   sees the amount at checkout, on the order, on the home card and in the Ready to collect notice.
3. **Handover** needs the fee. The agent's screen shows the fee for the ticked items and the agent
   must tick **Fee received**; the server refuses any other amount. The amount is stored on each
   line (`cashFeePaid`) and the agent sees **Fees collected**.
4. **Factory-fault return:** the buyer gets item price + the cash fee they paid, in tokens. The fee
   is a payout deduction from the factory (**Agent fee on returns**); a shortfall carries over.
   The agent keeps the cash and nothing is taken back from it. The factory still pays the return
   driver on arrival. "Courier fee and agent fee" is read as the one 5% fee, which covers couriers.
5. **Buyer fault, missing items and cancellations** move no fee; the buyer never paid it online.
   The missing-item deduction is the commission only.
6. **No pickup deadline** (owner, **2026-11-15**, replacing a 14-day Not collected rule Claude
   had built): a parcel waits at the agent until the buyer collects it. GroupBasket takes no
   action for a buyer who does not collect within 2 days of the parcel reaching the agent; the
   return window (`collectHours`, 48 from the agent receiving it) is not extended, so a late
   pickup has no return. There is no reminder and nothing happens to the parcel.
7. **Old orders** keep the fee they paid online, the weekly `AGENT_FEE` token credit and the
   take-back of `DEC-018`.

### DEC-029 - Any product from any factory, group buying only

**Status:** Approved **2026-11-21**, **Planned** (not built). The owner's words: "i need to build
this system for everything but only as group buying. removing the middle man … it should be able
to handle factories at any kind of product." This came after an idea to group-buy Atlas and other
stationery for the school new year.

1. **Scope.** GroupBasket sells any product kind (stationery, household goods, food, electronics,
   clothing and more) straight from the factory or maker. It is group buying only: no ordinary
   single-seller shop. The seller must be the maker or brand owner, not a reseller.
2. **Grow the current app.** Baskets, orders, payments, tokens, payouts, agents and returns stay.
   The catalogue becomes general: a **category tree**, **attributes per category** and **variant
   options** (any axes, not only size and colour). See `CATG-001`–`CATG-003`.
3. **Area agents stay as pickup points**, not resellers. Own baskets are unchanged.
4. **Price tiers by quantity** (`DEAL-001`–`DEAL-004`). A factory runs a deal for a set time with
   tiers (for example 1–49 at Rs 500, 50–199 at Rs 420, 200+ at Rs 380). **Every unit ordered by
   all buyers in the deal** counts. Buyers pay the first tier's price; when the deal closes the
   difference comes back as tokens and the factory is paid at the final tier. Pricing (the deal)
   is separate from shipping (the basket).
5. **Commission is a percentage per category** with an optional minimum per unit, inherited down
   the tree; it replaces the flat `commissionPerPiece` for new listings. Existing listings keep
   their snapshotted commission.
6. **Clothing add-ons only for clothing.** The fit heatmap, body mesh, Material Card and the
   audience-filtered shop (`DEC-025`) switch on only for categories that carry them (Clothing and
   Shoes). Shoes are no longer excluded. Return and report reasons become general (damaged, wrong
   item, not as described, missing parts, expired, changed mind) plus per-category ones (size,
   colour, stitching, material for clothing).
7. **Factories by category.** An admin approves which categories each factory may list;
   restricted categories need proof such as a product licence or trademark.
8. **Build order:** documents first, then category tree, variant options, general product fields,
   factory categories, category commission, group deals, gated clothing add-ons, a
   multi-category seed. Each is its own branch and pull request.

**Open (ask before building the affected part):**

- Can a deal fail when too few buyers join (full refund in tokens), or does it always run at the
  first tier's price? Until answered: no minimum; a deal always runs.
- Do agents take bulky or heavy items (fridges, rice bags), or do those go only by own basket?
- Which categories are banned (for example medicine, alcohol, weapons) and which need approval
  (for example food, cosmetics)?
- Does the 5% agent fee stay a percentage for very cheap and very expensive items?

### DEC-028 - Join requests instead of share links

**Status:** Built **2026-11-21** (`specs/006-join-requests`). The owner's words: "lets remove the
link sharing part. If a person needs to connect then it sends a connecting request, then the owner
can either accept or decline … lets remove this link sharing method from the system completely."

1. **No share links anywhere.** Share basket, Who can join (link-only or anyone) and the
   share-link basket page are gone, for own baskets and agent orders alike. Old basket links take
   a buyer in the basket to their order page; anyone else gets not found.
2. **Join a basket** in the cart lists every open own basket of the ticked items' factory except
   the buyer's own, each with **Ask to join**, **Asked**, **Declined**, or ready to pay.
3. **Asking** records the ticked items, tells the owner and moves no money or stock. One request
   per buyer and basket; a declined buyer cannot ask that basket again (Claude's call).
4. **The owner answers** on their order page (**Requests**: name and items, **Accept** or
   **Decline**) while the basket is filling. The buyer is told either way.
5. **Paying** into someone's basket needs an accepted request or an earlier paid order there.
   Accepted buyers pay from the cart and add more later without asking again.
6. Requests do not expire; they stop mattering once the basket stops filling.

### DEC-027 - Cart delivery choice; own baskets hold one factory

**Status:** Built **2026-11-21** (`specs/005-cart-delivery-choice`). The owner's words: "it
contains our 3 ways, Agent pickup, My basket, Join a basket … first has to select the item and
then the delivery option … select one by one or select all together and put the selected ones
into one delivery option and the rest in another." Then: "lets remove these limitings. A basket
can hold only items from that particular factory, no other factory items (they can have
different items from that factory)."

1. **Cart.** Items are grouped by factory, each with a tick box, plus **Select all** (everything
   is ticked when the cart opens). The ticked items go by one of three ways: **Agent pickup**
   (the nearest agents, then Checkout), **My basket** (the buyer's own open baskets of that
   factory, or **New basket** with address, town or area, phone and who can join) or **Join a
   basket** (other buyers' public open baskets of that factory). One payment per choice; paid
   items leave the cart and the rest stay for another way.
2. **One factory per own basket.** An own basket holds any live products of its factory, from
   any buyer, and refuses items of any other factory. Replaces `DEC-023` §1 (one product). My
   basket and Join a basket need every ticked item to come from one factory. Older baskets that
   were started for one product keep working and take the factory's other products.
3. **No quantity limit** per item beyond stock (the owner first asked for at most 2 of an item,
   then removed it).
4. **Pages.** The own-basket page is titled with the factory and lists each buyer's products and
   sizes; its share-link join form offers sizes of the products already in the basket. The
   separate Start own basket page is gone (it sends to the cart). Notices name the factory.
   The basket page is only for someone opening a share link to join: the owner and anyone
   already in the basket are sent to their order page, which has everything (owner,
   2026-11-21: "remove that page, no need"). Paying for an own basket leads to the order.
7. **One card per basket.** A buyer who paid more than once into the same own basket sees one
   card on Orders, with all their items and the amounts added up (owner, 2026-11-21).
5. **Agent checkout** buys only the ticked items, one order per factory, as before.
6. The minimum to place an own basket stays `ownMinItems` (10) pieces, counted across all its
   products (Claude's call). Each product keeps its own price.

### DEC-026 - Orders in four stages, no cancelling, 10-day own baskets

**Status:** Built **2026-11-21** (`specs/004-orders-four-stages`). The owner's words: "Filling,
Packing, On the way, Delivered … there is nothing called cancel because after making a payment
you can't cancel it … reduce that to 10 days, then that order will get cancelled, they will get
the tokens back automatically."

1. **Four stages** everywhere a buyer sees an order: **Filling** (basket open), **Packing**
   (locked or packed), **On the way** (with the courier), **Delivered** (at the agent or
   collected; own basket delivered). The old Paid step is gone. An own basket cancelled by the
   wait rule shows as **Refunded**. Orders never paid are not listed.
2. **No buyer cancelling.** Once paid, an order cannot be cancelled by anyone who bought it:
   the Cancel button and the buyer cancel path are removed. Replaces the buyer cancel in
   `ORD-004` and `DEC-023` §5. Refunds now come only from the system (wait rule, missing items,
   returns, late payment).
3. **Own basket wait: 10 days** (`ownMaxWaitDays`, Settings, default 10; agent baskets keep
   `maxWaitDays` 60). At 10 days from the first payment an own basket the owner has not placed is
   placed automatically if it holds `ownMinItems`, otherwise cancelled and every buyer gets
   everything they paid back as `ORDER_CANCEL` tokens, PayHere fee included. Replaces
   `DEC-023` §7's 60 days. The owner still places the order (Packing starts only then).
4. **Orders page:** tabs Agent pickup, My baskets, Joined baskets; inside each, groups Filling,
   Packing, On the way, Delivered, Refunded with counts, empty groups hidden.
5. **Order page:** the stage is the heading; one card with the tracker (a date under each reached
   stage), the fill, and what can be done now (Share, Place order, Who can join while Filling;
   Received while On the way; the pickup code, pieces and cash fee when it is at the agent);
   then the pickup point or delivery; then for an own basket a **Buyers** card: you first, then
   everyone else with their sizes. The owner sees each buyer's items, PayHere fee, tokens and paid
   amount, and the basket totals (items, PayHere fees, total, courier fee on delivery); a joiner
   sees only their own money and other buyers' first names and sizes.

### DEC-025 - Personal shop: the buyer's own audience

**Status:** Built **2026-11-21**; limited to clothing categories by `DEC-029` (Planned). The owner removed the shop's Audience box (Men, Women, Girl,
Boy, Kid): a signed-in buyer should only be offered clothing for their own category, to make the
site highly personal.

1. **Sign-up asks** gender (Male or Female) and date of birth; the age is worked out from the
   date, never stored. Both are required at sign-up. `User.gender` and `User.birthDate` (date only).
2. **Audience from age:** 13 and over Men or Women, 6 to 12 Boy or Girl, under 6 Kid
   (`audienceFor` in `src/lib/taxonomy.ts`), matching the size bands in the taxonomy.
3. **Shop and buyer home** list only that audience plus products with no audience (unisex).
   There is no way to switch audience in the shop; the Category list follows the audience.
4. **Existing buyers** (no gender or birth date yet) and signed-out visitors see everything;
   buyers can add both on Profile.
5. The signed-out home hero's "Biggest savings" row is unchanged (no buyer known).

### DEC-024 - Home hero: factory to you, no middlemen

**Status:** Built **2026-11-21**. The owner proposed "Direct factory to Consumer. No more middle
man" and asked for the best plan: a new buyer should feel they are *saving* on the real thing
because the middleman is gone, not that the goods are cheap.

1. **Headline.** "Direct from factory to you. No more middlemen." (owner's line, "consumer" made
   personal). The button below it reads "Shop and save" (owner's choice).
2. **Proof, not prose.** Factory and You sit at the two ends of an arrow line
   (Factory → Importer → Wholesaler → Shop → You). It plays three times (about 9.5 s apart; it waits while the hero is hovered or
   focused) and then rests on the end state; each middleman shakes with a red
   edge and turns to dust (tiny pieces drifting off), the line fills green, You pulses, then the
   top “Biggest savings” product (name shown, links to it) counts down from retail to our price
   with the struck retail price and −% badge. CSS animation plus small client code for the
   counter and the replay. Reduced motion shows the end state. The owner removed the pause
   button and limited it to three plays (2026-11-21); there is no on-page pause (WCAG 2.2.2
   trade-off accepted). No
   explainer sentences. The average “% below retail” figure was tried and removed.
3. **Removed** the "Clothing from partner factories" box and the four numbered steps.
4. **Biggest savings.** The signed-out product row ranks by saving below retail (then cheapest
   for products without a higher retail price), with a −% badge and the struck retail price.

### DEC-023 - Own baskets delivered to the owner

**Status:** Built **2026-11-18** (`BSK-008`). The owner asked for it and told Claude to decide the
open points and build it as recommended. **Rules:** `BSK-008`, `BSK-004`, `BSK-005`, `ORD-004`.

Owner's words, in short: buyers can group together and have the garments delivered to the basket
owner's delivery address. One person pays and creates their own basket and puts their item in it;
other buyers buy the same product into that basket. No returns. The owner pays the delivery fee.
The basket holds one design only (the same T-shirt), in different sizes. The owner chooses whether
it is shared by link or public. Normal price.

1. **One product.** ~~An own basket is for one product; joiners buy any size or colour of it.~~
   Replaced by `DEC-027` (2026-11-21): an own basket holds any products of one factory.
2. **Starting.** The owner buys into a new basket with their address, town or area and phone,
   and picks **People with the link** or **Anyone**. The basket opens to others only once the
   owner's payment arrives; if it never does, the basket is cancelled with the unpaid order.
3. **Who sees what.** Public baskets list on the product page by town or area and owner name;
   the address and phone are shown to the owner only (Claude's call). The owner can switch
   visibility while the basket is open.
   Everyone in the basket sees the others and what they bought, sizes and counts, on their
   order page (owner, 2026-11-21). The owner sees full names; joiners see first names only
   (Claude's call); the owner is marked Owner.
4. **Price.** Normal price. No agent, so no 5% agent fee and no pickup code.
5. **Cancelling.** ~~Joiners can cancel while the basket is open.~~ Replaced by `DEC-026`
   (2026-11-21): nobody can cancel a paid order.
6. **Placing the order** (changed by the owner 2026-11-18). The owner presses **Place order**,
   which works only once the basket holds `ownMinItems` items (10, Claude's call, changeable in
   Settings). It does not go while someone is still paying to join. GroupBasket charges no
   delivery, courier or agent fee for an own basket; those are shown only when an agent is chosen.
   The owner pays the courier when the courier delivers, outside GroupBasket.
7. **Maximum wait.** After `ownMaxWaitDays` (10, `DEC-026`; was 60) the basket is ordered if it holds enough items;
   otherwise it is cancelled and every buyer, the owner included, gets everything back as tokens
   (Claude's call).
7a. **Late payment** (owner, 2026-11-18). A joiner whose payment arrives after their stock hold
   ran out, when the items may have sold meanwhile, gets the payment back as tokens less the
   PayHere fee. Agent-basket late payments are unchanged.
8. **Shipping.** A paid basket locks and goes through factory packing and manual courier booking
   (`BSK-004`, `BSK-005`) to the owner's address, which the factory and the admin see.
9. **Receipt.** The owner taps **Received**. Every order is received and collected at once; the
   owner hands the items to the joiners. GroupBasket keeps no handover record.
10. **No returns.** No return of any kind, factory fault included. Factory payouts follow the
    usual timing from receipt.
11. **Notices** (Claude's call): the owner each time someone joins and that the order is placed; joiners that it was ordered; everyone when it ships or is cancelled; joiners to collect from the owner on delivery.
12. **Courier fee.** The admin still records the courier booking; the owner pays the courier
    directly on delivery.

### DEC-022 - Material Library and Material Card

**Status:** Built **2026-11-17** (`MAT-001`). The owner signed off the rule bands and asked for
every material to be published on **2026-11-17**. **Rules:** `MAT-001`, `FIT-001`, `UX-001`, `SUP-002`. How it works:
[material-system.md](material-system.md). Design: [material library design](superpowers/specs/2026-11-16-material-library-design.md).

The owner asked for a curated fabric library that factories pick from per product, and a buyer
Material Card whose every value is traceable to a lab measurement, a published source or a
versioned GroupBasket methodology rule; anything else is stored null and shown as _Not yet
measured_. Owner's choices from the spec: four axes (Soft↔Firm, Light↔Substantial,
Smooth↔Textured, Breathable↔Insulating); `WEIGHT_v1` maps 80–400 gsm linearly to 0–100 (a
product decision); measured axes other than weight need a GroupBasket reference swatch set and
stay off until it is measured; no temperature-comfort or "n of 5" breathability claim without
ISO 9237/ASTM D737 and ISO 11092 data.

Claude's calls (owner to confirm):

1. The Material Card replaces the fit card's material panel. Thermal range and breathability
   are no longer shown or entered; their columns stay unused until a later migration.
2. gsm lives on the product's shell material and is mirrored into `Product.gsm` for the fit
   heatmap; a change still clears the fit approval.
3. A factory's material choice shows without approval (`SUP-002`); gsm or composition more
   than 15% outside the library range needs a confirm tick and joins a Factory admin review list.
4. Library admin belongs to the Factory admin area.
5. Estimated bands come from declared, versioned rule tables (`SOFT_EST_v1`, `SURFACE_EST_v1`,
   `BREATH_EST_v1`) whose rows cite evidence; the numbers are a product decision stated in the
   rule text. A row without evidence makes the axis not available. All library materials stay
   draft until the owner reviews the tables and publishes them.
6. **Exception to `UX-001`:** the Material Card may show the verification badge, the word
   _estimate_, _Not yet measured_ and a _How we know this_ disclosure per value.
7. (Build, 2026-11-17) Sources, evidence, materials, labs and rules are edited in `seeds/` and
   loaded with `npm run materials:load`, so every change is reviewed in git and the provenance
   check runs on it. Admin pages show these tables and publish materials; they do not edit them.
8. (Build) Evidence whose quote could not be read from the source is stored but never used by a
   rule or the card. Rules that would rest on it stay inactive (the modal, polyester and softener
   softness shifts; the knit-structure breathability shift, whose source contradicts itself).
9. (Build) A factory's gsm is shown as _declared_, not measured; an accredited mass test
   (ISO 3801, EN 12127, ASTM D3776) makes the weight bar _measured_.
10. (Build) Every lab's accredited scope is empty because none of the scope documents could be
    read (404; SLAB's directory also refuses automated reading). Until a scope is checked and
    recorded with its date, no lab result counts as accredited.
11. (Owner, 2026-11-17) Publish all 33 materials; the estimate bands in `rules.ts` are accepted.
12. (Owner, 2026-11-17) Picking a material no longer rewrites the product's weave text, so it
    clears fit approval only when the gsm changes.
13. (Build, 2026-11-17) A Factory admin records a lab's scope in the app (tests listed, date
    read, document link); the loader keeps an admin check over an older seed one. Saving a scope
    re-checks that lab's results. Reference swatch sets are built in the app; the measured bars
    turn on for a test once the active set has 10 swatches with accredited results for it.

### DEC-021 - Personal body mesh and Deep Fit Test

**Status:** Paused by the owner **2026-11-15**; resumed **2026-11-16** ("keep doing"). Built: fitting
service (`tools/body-fitting`, synthetic tests only), outline upload from the phone, job queue and
worker (`npm run fit:worker`), private body file and the "Does this look like you?" check on
`/account/fit`, and the product page drawing the garment on the buyer's confirmed body. Clusters and
a queued Deep Fit Test are not built (see below). **Rules:** `FIT-001`.

The owner asked for the buyer's own 3D body (Anny, fitted from the two onboarding photos), shape
clusters with cached garment drapes, and an async per-user Deep Fit Test. Only one choice is
made: **photos still never leave the phone**; the phone sends the body outlines and joint
positions, deleted after the buyer confirms (7-day sweep). Three questions are open: the Deep Fit
Test engine without Blender or patterns, whether archetype mannequins also move to Anny, and
whether the personal body file is private or on a public link. Findings, plan and questions:
[the parked plan](superpowers/plans/personal-body-mesh-paused.md). The unbuilt parts (accuracy test, deployment, motions, Anny
mannequins, clusters, cloth simulation) are planned, not built, in
[the remaining-work plan](superpowers/plans/2026-11-16-personal-body-remaining.md).

On resuming, the owner did not answer the three questions; work proceeds on the recommended
answers until the owner says otherwise: (1) the Deep Fit Test is geometric on the buyer's own
Anny body from the size chart and fabric, (2) archetype mannequins also move to Anny, (3) the
personal body file is private, served only to its owner.

**Geometric engine runs on the phone (2026-11-16, owner to confirm).** With answer (1), the
garment on the buyer's body is the covered body surface pushed out by each area's room from the
size chart, coloured with the fit report's tension (`src/lib/fit/drape.ts`). It takes
milliseconds in the browser and works for tops, outerwear, bottoms, shorts and dresses. Since
2026-11-16 the body file carries a skeleton, so the body and its garment walk, run, reach and
sit (the garment follows the body; it does not swing or fold).

**Standard shapes are Anny bodies (2026-11-16, assumed answer 2, built).** The four seed
archetypes are fitted from their height, chest, waist and hip with the same model and carry the
same skeleton, so a buyer without an own body sees the garment drawn over their nearest shape
the same way. The earlier tube mannequin files and the `FitAsset` table are no longer used for
a shape that has a body file; deleting them waits for the owner.

**Release gate (2026-11-16, Claude's call, owner to confirm).** The own 3D body is built only
when `BODY_FIT_ENABLED` is `"1"`. It stays off in production until at least 10 tape-measured
volunteers give a mean absolute error of at most 2 cm for each of chest, waist and hip, with at
most 2 failed builds in 10 (`tools/body-fitting/accuracy.py`). No volunteers measured yet. So the body clusters (shared
drapes) and the queued, 5-a-day Deep Fit Test are not needed for it; they come back only if a
real cloth simulator (Blender, XRTailor) is added. A licence check
(`npm run check:licences`, in `npm run check`) blocks the non-commercial body models.

**Deep Fit Test labels (2026-11-16, exception to `UX-001`).** The fit card for a buyer with a
confirmed own body may show the button _Deep Fit Test_ (disabled once the day's 5 are used), the
status _Testing…_ while the test is queued or running, and the label _Simulated on your body_
when the result is shown. No other explanatory text.

### DEC-020 - Personalized fit heatmap

**Status:** Decided **2026-11-15**, built **2026-11-15**. **Rules:** `FIT-001`, `UX-001`,
`CAT-001`.

The owner asked for the personalized fit heatmap (buyer photos → measurements → per-area
tension on a 3D garment, coloured green to deep red) and chose:

1. **Size charts and fabric data** (per-size garment dimensions, stretch %, gsm, weave, thermal
   range, breathability, care) are entered by the factory on its product page and approved by a
   Factory admin. Factory listings themselves still go live without review (2026-11-03); only
   the fit data waits, and any factory change clears the approval. A product without an
   approved chart shows the material panel only.
2. **Photos are processed on the buyer's phone only.** Photos never leave the device; only the
   derived measurements with their uncertainty, height, corrections and the consent time are
   saved. The buyer can edit or delete the profile at any time.
3. **Fit card text:** a compact colour legend (Comfortable → Tight) and one line, _Guidance, not
   a guarantee_, are allowed on the fit card as a recorded exception to `UX-001`. No other
   explanatory text.
4. **3D scope:** the Three.js viewer and heatmap shader are built now on seed data from a Python
   pipeline (2 archetypes, 1 test garment). The real Blender cloth-simulation step is a
   documented stub until Blender and factory garment patterns exist.
5. **No live simulation:** tension is precomputed per garment × archetype × size × area; the
   page adds a per-buyer adjustment from ease and fabric stretch (constants `k`, `k2` in
   `src/lib/fit/config.ts`, to be calibrated from "How did it fit?" feedback).

Settled by Claude while building (open to the owner): the fit card is shown to buyers only;
"How did it fit?" sits on the order page (not the buyer home, whose order `UX-002` fixes);
photo intervals are 80% (±1.28 SD) and typed values ±1 cm; a top's length is compared with the
torso plus a 12 cm hem drop; the stored simulation tension is the peak over the four motions;
photos use MediaPipe's Full pose model (Heavy, ~30 MB, is too large for buyers' phones); comfort
is judged against an ideal ease per garment type and area (`EASE`: e.g. 10 cm at a shirt chest,
16 cm on a hoodie, 2 cm at a trouser waist), starting values to calibrate.

## Legacy rule references

### Rule IDs retired by the area agent model (2026-11-08)

Spec 003 retired the group-cart rules (FR-033). Their IDs are never reused. New work references the
replacement IDs in the [main brief](../.claude/agents/groupbasket.md#6-business-rules).

| Retired ID                                | Replacement                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| `CART-001` — Cart minimum                 | `BSK-002` (basket lock amount)                        |
| `CART-002` — Cart lifetime                | `BSK-003` (maximum wait)                              |
| `CART-003` — One/many active carts        | `ORD-001` (personal cart), `BSK-001` (agent baskets)  |
| `CART-004` — Discovery and sharing        | None (discovery removed; Share basket under `UX-002`) |
| `CART-005` — Moving items/merging         | None (removed)                                        |
| `CART-006` — Member done before finish    | None (removed; `DEC-014` retired)                     |
| `INV-001` — Reservations                  | `ORD-003`                                             |
| `LOT-001` — Lot pricing                   | `SUP-002` (factory price plus commission)             |
| `LOT-002` — Store operations              | None (no warehouse)                                   |
| `PAY-001` — Owner payment                 | `PAY-004`, `PAY-005` (each buyer pays by gateway)     |
| `PAY-002` — Slip review                   | `PAY-005` (verified gateway notice)                   |
| Zero-due exception to `PAY-001`/`PAY-002` | `PAY-004` (token-only checkout skips the gateway)     |
| `PAY-003` — Refund scope                  | `PAY-006`, `TOK-001`                                  |
| `FUL-001` — One clothing delivery         | `BSK-005`                                             |
| `FUL-002` — Packing                       | `BSK-004`                                             |
| `FUL-003` — Completion/retry              | `BSK-005`, `BSK-006`                                  |
| `SAMPLE-001` — Group design samples       | None (removed; `DEC-009` retired)                     |
| `COM-002` — Owner chat                    | None (removed)                                        |
| `ADMIN-001` — Operational responsibility  | `ADMIN-002`                                           |

Rewritten in place with the same topic: `ADMIN-002`, `LOC-001`, `COM-001`, `SUP-001`, `SUP-002`,
`FAC-001`, `RETURN-001`, `RATE-001`, `QUAL-001`, `FAULT-001`, `DATA-001`, `UX-001`, `UX-002`.
New: `ORD-001`–`ORD-005`, `BSK-001`–`BSK-007`, `PAY-004`–`PAY-007`, `TOK-001`–`TOK-003`,
`AGT-001`–`AGT-005`. Parked: `SUP-003`, `COM-003`, `BRAND-*`, `GIFT-*`.

### Former CLAUDE.md rules

Former `CLAUDE.md` rules are mapped below so historical comments and specialist notes remain traceable. New work should reference stable IDs in the [main brief](../.claude/agents/groupbasket.md#6-business-rules).

The old `groupbasket.md` had inconsistent/repeated numbers and was later renumbered; identify those references by topic, not number alone. Historical descriptions are not alternative active policies.

| Former CLAUDE.md topic / number           | Current rule or reference                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 1 — Minimum order                         | `CART-001` (retired) → `BSK-002`                                             |
| 2 — Stock reservation                     | `INV-001` (retired) → `ORD-003`                                              |
| 3 — Cart expiry                           | `CART-002` (retired) → `BSK-003`                                             |
| 4 — Minimum reached notices               | `CART-001`, `COM-001`                                                        |
| 5 — Owner payment                         | `PAY-001`, `PAY-002` (retired) → `PAY-004`, `PAY-005`                        |
| 6 — Slip review                           | `PAY-002` (retired) → `PAY-005`                                              |
| 7 — No refunds                            | `PAY-003` (retired) → `PAY-006`, `DEC-005`                                   |
| 8 — Delivery                              | `FUL-001`, `FUL-003` (retired) → `BSK-005`, `BSK-006`                        |
| 9 — Visibility/sharing                    | `CART-004`                                                                   |
| 10 — Stock type/defects                   | `CAT-002`, `DEC-005`                                                         |
| 11 — Roles, sellers, design tests, brands | Participants table; `SUP-001`–`SUP-003`, `DATA-001`, `BRAND-001`/`BRAND-002` |
| 12 — One active cart                      | `CART-003`                                                                   |
| 13 — Location/pins                        | `LOC-001`                                                                    |
| 14 — Merge                                | `CART-005`                                                                   |
| Duplicated 14 — Owner chat                | `COM-002`                                                                    |
| 15 — Nearest carts                        | `CART-004`                                                                   |
| 16 — Cart names                           | `CART-004`                                                                   |
| 17 — Receiving/packing                    | `SUP-002`, `FUL-002` (retired) → `BSK-004`                                   |
| 18 — Availability replaces statuses       | `CAT-001`                                                                    |
| 19 — Admin task ownership                 | `UX-002`                                                                     |
| 20 — Lots and turnover                    | `LOT-001`, `LOT-002` (retired) → `SUP-002`                                   |
| 21 — Premium promotional gifts            | `BRAND-001`, `GIFT-003`, `DEC-001`                                           |
| 22 — Body measurements                    | `FIT-001`, `DEC-006`                                                         |
| 23 — Family/individual gifts              | `GIFT-001`, `GIFT-002`, `DEC-002`–`DEC-004`                                  |
| 24 — Brand partner dashboard              | `BRAND-002`, `DEC-001`                                                       |
