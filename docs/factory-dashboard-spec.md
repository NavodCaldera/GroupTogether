# Factory dashboard: content agreed with the owner

Interview with the product owner, 2026-11-03/04. This records **what** each factory role's dashboard
contains. Priority and layout are agreed next, role by role, before any code. Business rules
decided here are also in [decisions](decisions.md) (`DEC-012`).

**Being rebuilt, 2026-11-07:** the Packing content below is replaced by the
[approved brief](../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-06/brief.md).
Admin books PickMe, and there is no parcel size choice or expected arrival time. Other sections and
layouts are earlier input until their interview ends. Design drafts and likes are in this rebuild;
preorders are paused (`DEC-015`). The payout sum is factory price plus commission (`DEC-013`), not "sale minus LKR 100".

## Accounts and roles

- Each person at a factory has their own login. The factory owner adds and removes staff and
  gives each one fixed role: **Packing**, **Planner**, **Sales** or **Owner**. A factory may have
  several owners.
- Each role sees only its own screens. Only owners see money (sales value, commission, payouts);
  staff see pieces, not rupees.
- Every action records who did it (packing, handover, stock changes, replies).

## Packing / floor staff

- Paid orders to pack, with items by product, size and colour.
- **Tick-off checklist** per order: each line is ticked as it goes in the parcel; "Mark packed"
  unlocks only when every line is ticked.
- **Printable packing slip / label**: order code, items, delivery city. No buyer name or phone.
- **Photo of the packed parcel** before handover, kept as proof.
- **Report a problem** on an order (item missing or damaged): the order is held and admins are told.
- **Book PickMe** after packing, through the PickMe API, choosing the **parcel size / weight**. If
  the API fails: book in the PickMe app and type in the reference, driver and tracking link.
- **Driver details**: name, phone, vehicle number, expected arrival.
- **Confirm handover** ("Given to driver"): records time and person; the order moves to On the way.
- **Live tracking** after pickup until delivered.
- **Failed delivery returns**: staff see a failed drop is coming back and confirm when it is back.
- The cart owner still pays the PickMe driver on delivery (unchanged).

## Stock / production planner

- **Design drafts before publishing**: photos or sketch, planned price (exact or a range), planned
  sizes and colours, minimum pieces to produce and production time.
- Customers respond to drafts with: **"I'd buy this" + size** (interest only, not an order or
  payment), **1–5 stars** for the design, **written comments**, and **votes** on questions the
  factory asks (colour A or B, price X or Y).
- The **planner decides** when a draft is made and published; interested buyers are notified when
  it goes on sale.
- For products on sale: **stock left per size** (sold-out and low flagged), **selling speed**
  (pieces per week per size, days until each size runs out), **held in unpaid carts** (separate
  from sales), and **production batches** (e.g. 200 pcs ready 20 Nov: the listing can show more is
  coming, and stock is added when the batch is done).

## Sales / listing

- Listings with **several photos** (front, back, fabric, one per colour), a **size chart**
  (measurements per size), **fabric and care**, and **colours as options** with their own stock.
- **Change price any time** (items already in carts keep their price) and **sale price with an
  end date**.
- Numbers: **views** per product (new tracking), **added to carts vs paid** (and expired unpaid),
  **best and worst sellers** by paid pieces in the last 30 days, **rating per product**.
- Feedback: **public replies** to ratings and comments, **public answers** to buyer questions on
  the product page, **report abusive** feedback to admins. **No direct contact** with buyers.

## Owner / manager

- **Sales and payout trend**: paid sales, our commission, owed and paid, by week or month.
- **Team activity**: who packed what, pack time per person, problems reported.
- **Delivery performance**: pickup delays, failed deliveries and returns per month.
- **Reputation**: factory rating trend and worst-rated products.
- **Team management**: add/remove staff, roles, lock someone who leaves.

## Payouts (owner decision)

- Commission: **LKR 100 per piece** sold.
- Paid **per order, after delivery, by bank transfer**: an admin records the transfer and bank
  reference; the factory sees the order as paid.

## Contact GroupBasket

- **Chat per order** and one **general chat** with our admins; **urgent** flag notifies the
  responsible admin at once. **Any staff member** can write.

## Moderation

- Comments, questions and replies **post at once**; anyone can report one and an admin hides it
  if needed.

# Priority and layout (agreed 2026-11-04)

Phone first. Each role gets **3–4 bottom tabs** for its own work only; owners get every tab.

## Packing / floor staff

- **First screen: next order first.** Strips above it for anything more urgent, in this order:
  a **driver arriving now**, then **parcels coming back** from a failed drop. Below the big
  "Next to pack" card (code, city, size × pieces, **Start packing**): how many more are waiting,
  then orders waiting for a driver, then returns.
- **Checklist: one big tap row per product + size + quantity**; a tapped row turns green. "1 of 2
  ticked"; **Report a problem**; **Mark packed** stays locked until every row is ticked.
- **After packing: one screen with the steps in order** (1 Packed, 2 Photo, 3 Book PickMe with
  Small/Medium/Large and "booked in the app instead?", 4 Give to driver). Finished steps
  collapse with who and when; the current step is open.

## Stock / production planner

- **First screen: restock list first** (sizes running out soonest, with days left; sold out on
  top), then **batches in production**, then **design drafts** with interest and stars, and a
  **New design** button.
- **Draft results:** wanted vs the minimum as a bar, **interest per size**, stars with count,
  vote results, latest comments; **Make it**, **Edit**, **Drop**.
- **Stock on sale:** one **row per size**: left, held in unpaid carts, sold per week, days until it
  runs out, coloured by urgency; **+ Production batch**.
- **Batch done:** the batch lists planned pieces per size; the planner enters what was made and
  taps **Add to stock**.

## Sales / listing

- **First screen: things to answer first** (unanswered questions, new ratings and comments), then
  **best and worst sellers** (30 days), then all listings, and **New listing**.
- **Product numbers: a funnel** views → in carts → paid with the drop between, expired unpaid,
  rating with count, price history.
- **Listing editor: one page with sections** (Photos, Details incl. fabric and care, Colours &
  sizes, Size chart, Price & sale with end date); save once.
- **One inbox** for questions, ratings and comments with filters; reply or report inline.

## Owner / manager

- **First screen: problems first** (failed drops, reported problems, low ratings), then money
  (owed now, paid this month), then sales and commission by week, then links to Team, Delivery,
  Reputation.
- **Payouts: a statement per delivered order:** pieces, sale, minus LKR 100 × pieces, payout,
  and **Paid** with bank reference or **Owed**; owed total.
- **Team: one row per person:** name, role, orders packed this week, usual pack time, problems
  reported; tap to change role or lock; **Add staff**.
