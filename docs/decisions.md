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

**Status:** Planned capability; details open. **Rule:** `FIT-001`.

Decide optional/required measurements, units, garment measurements/size charts, behavior when data is absent, and collection/visibility/editing/deletion of profile measurements. Approximate dimensions alone do not justify exact-fit promises. Personalization is not implemented.

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

**Status:** Open, raised by the owner on **2026-11-14**. Nothing is built. **Rules:**
`RETURN-001`, `PAY-006`, `PAY-007`, `TOK-001`, `TOK-003`, `AGT-004`, `DATA-001`.

Owner proposal: for a buyer-fault return the buyer hands the item to the agent within 2 days. A
buyer who wants money quickly gets 80% of the amount as tokens. A buyer who waits gets the full
amount once the agent resells the item to someone in the agent's network. GroupBasket takes no
commission on this.

**Revised again 2026-11-14:** GroupBasket takes no part in buyer-fault returns. The buyer and
the agent arrange any resale between themselves, at any price they choose. No tokens, listing or
price from GroupBasket. The factory is paid for the original sale as normal.

Effects and open points:

1. The current buyer-fault refund (item price minus courier as tokens) and its send-back path
   would be removed from `RETURN-001`.
2. Factory faults gain weight: a buyer-fault ruling now costs the buyer everything, so the
   Factory admin's final decision on fault matters more. Factory-fault returns are unchanged.
3. Private buyer–agent deals sit outside GroupBasket like other cash deals (`TOK-002`); buyers may
   still blame GroupBasket when an agent lets them down. Any warning belongs in the agent
   agreement, not on-screen text.
4. Consumer rules on change-of-mind returns in Sri Lanka have not been checked.
5. **Decided:** the app keeps buyer-fault returns as a record only, with no tokens from GroupBasket.

**Flow (owner, 2026-11-14):** the buyer requests a buyer-fault return with a reason; an admin
accepts it; the agent is notified; only then can the buyer hand the item to the agent. When the
item is sold, the agent marks it Sold. Purpose: a history of buyer-fault returns that shows
problems such as wrongly identified material, so GroupBasket knows what happens to every piece.

Open points, with recommendations:

1. **Decided:** the Agents and orders admin accepts or refuses; the agent notice is sent
   automatically on acceptance. Open: a read-only view of buyer-fault reasons per product for the
   Factory admin and the factory (no buyer names), since admins cannot reach other areas
   (`ADMIN-002`).
2. **Reasons** as fixed choices (material not as described, size, colour, quality feel, changed
   mind, other) with a short note, counted per product and factory.
3. **Send to Factory admin** when the reason shows the listing was wrong, such as material not
   as described; the return then follows the factory-fault path.
4. **End states:** Refused, Not brought, Sold, and Taken back when the buyer collects it unsold.
   An agent cannot close while holding one (see the resale split below).
5. **Decided:** the buyer has 2 days after acceptance to hand the item to the agent; otherwise
   the return closes as Not brought and the buyer keeps the item.
6. **Factory payout:** buyer-fault returns should not hold the factory's payout for that item.
7. **Decided:** the agent resells at the price the buyer paid (see the resale split below).

**Resale split (owner, 2026-11-14):** GroupBasket has already been paid the full price, for
example LKR 1,000 including the LKR 100 commission, and the factory its LKR 900. The agent resells
the returned item for that price, keeps the commission share (LKR 100) and gives the buyer the
factory price (LKR 900). The buyer must be told before filing that a buyer-fault return does not
give back the full amount. Agents therefore see the item price and the buyer's share, which
reveals the commission per piece (an exception to `DATA-001`). An agent cannot close while holding
these items (`AGT-004`).

### DEC-018 - Courier and agent fees as a percentage

**Status:** Open, raised by the owner on **2026-11-14**. Nothing is built. **Rules:** `PAY-004`,
`BSK-006`, `AGT-005`, `RETURN-001`, `BSK-007`.

The owner wants the courier charge (LKR 40 per item) and agent fee (LKR 20 per item) replaced by
a percentage of the item price, stated as 5%; the PayHere fee stays 3.3%. **Decided:** 5% is the courier and agent fees together
(LKR 50 on a LKR 1,000 item). **Decided:** there is no split. The whole 5% goes to the agent,
and the agent pays every courier fee from it; the booked-fee repayment (`COURIER_REPAY`,
`BSK-006`) would end. The exception is the courier for factory-fault returns going back to the
factory, which the agent does not pay.

Open points:

1. **Decided:** for a factory-fault return the factory pays the courier when the parcel reaches
   it. Nothing is deducted from the factory payout for it. Open: what happens if the factory
   refuses the parcel.
2. **Small baskets:** a basket shipped by the two-month rule with few items may earn the agent
   less than the courier fee, while an admin chooses the courier and its price.
3. **Cash out, tokens in:** agents pay drivers in cash but are paid in tokens (`PAY-006`).
4. **Refunds:** cancellations and missing items return the 5% to the buyer; buyer-fault refunds
   no longer exist (`DEC-017`).

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
