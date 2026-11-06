---
title: Factory partnership — trust from the first day
status: approved
created: 2026-11-04
updated: 2026-11-06
---

# Product Brief: Factory partnership

## Summary

GroupBasket sells clothing straight from factories to groups of buyers. Today a factory is let in
by an admin creating its account by hand, and from then on it is trusted completely: no agreement,
no checks, listings go live without review, and the only quality signal is one star rating per
cart. This change rebuilds the start and the safety net of the partnership: a factory proves who it
is, accepts a 12-month agreement inside the app, and is watched through ratings and reports on
every product. Bad products or factories can be hidden or removed, and buyers whose paid orders
are cancelled get tokens instead of losing their money.

Existing factory work (listing, packing, PickMe, staff jobs) stays where it fits (decision A).

## The problem

- No written agreement exists with any factory, so GroupBasket has no agreed basis for removing one.
- Anyone an admin creates is trusted; nothing proves the business, owner or bank account is real.
- Quality is visible only as one rating for the whole factory, so one bad product hides among good ones.
- Removing a factory has no defined effect on paid orders, and buyers have no way to recover value
  (there are no refunds — `PAY-003`).

## Who this serves

- **Factory owner or manager** — the only person GroupBasket onboards; adds their own staff.
- **Factory staff** — unchanged jobs (Packing, Planner, Sales, Owner).
- **Factories admin** — invites, reviews applications, watches flags, hides products, removes factories.
- **Core admin** — publishes agreement versions and is the only one who sets the commission.
- **Buyers (cart owners and members)** — rate and report products; receive tokens.

## Main journeys

1. **Join.** A factory applies on a public form, or a Factories admin invites the owner.
2. **Checks.** Required: BR number + certificate copy, owner NIC number + photo, factory address +
   photos, bank account whose name matches the business or owner. A factory visit to see samples is
   optional. An admin approves or rejects.
3. **Agreement.** The owner signs in and accepts the agreement in the app. The system keeps who,
   when and which version. Nothing can be listed and no staff added before that.
4. **Selling.** Unchanged, except prices: the factory sets the amount it receives; buyers see that
   amount plus GroupBasket's commission (LKR 100 per piece by default, changeable by an admin; a
   change applies to new listings only).
5. **Renewal.** 12-month term; reminder 30 days before the end. Not renewed → listings hidden on the
   end date; paid orders are still delivered. A new agreement version must be accepted before selling
   continues.
6. **Rating and reporting.** Every product has its own rating. Only people who received the item may
   rate, once per product per order. A 1 or 2 star rating needs a report with a reason; a photo is
   required for visible problems (damaged, wrong item, stitching) and optional otherwise. The
   factory's score is the weighted average of all its product ratings.
7. **Flags.** A product is flagged under 3.0 stars over 10+ ratings or with 3 reports in 30 days; an
   admin may hide that product. A factory is flagged under 3.0 over 20+ ratings or when several of its
   products are flagged. Nothing is removed automatically.
8. **Removal.** An admin can remove a factory for bad quality without notifying it. Listings vanish
   and unpaid cart items are removed at once. All paid orders not yet delivered are cancelled; each
   buyer is told the reason and gets tokens. Money already earned is reviewed case by case.
9. **Tokens.** For a cancelled order, each member receives tokens for their own items (1 token =
   LKR 1, never expire). They spend tokens only on items they themselves add to a later cart; this
   lowers the owner's transfer. The cart minimum counts full item value.

### Example

Lanka Shirts applies, uploads its BR certificate, NIC and bank details, and is approved. Its owner
accepts agreement v1 on 1 Dec 2026 (valid to 30 Nov 2027) and adds two packers. It lists a shirt at
LKR 1,400; buyers see LKR 1,500. In March its "Linen Tee" collects six 1–2 star ratings with photos
of torn seams; the product is flagged and hidden. Two more products follow and the factory is
flagged; the admin removes it. Nimal's paid cart holds Kasun's two Lanka Shirts tees (LKR 3,000);
the admin cancels that line and Kasun receives 3,000 tokens, which he later uses on his own items in
another cart.

## First version (in scope)

1. Public application and admin invite.
2. Identity, business and bank checks with private documents.
3. In-app agreement: versions, 12-month term, reminder, expiry, re-acceptance.
4. Per-product ratings and required reports for 1–2 stars; weighted factory score.
5. Product and factory flags, hide a product, remove a factory.
6. Tokens for orders cancelled by a removal.
7. Commission added on top of the factory price, admin-configurable, new listings only.
8. Return applications within 2 days of delivery: the factory answers within 24 hours, admins see
   every return, every refusal goes to an admin, and an accepted return is paid back as tokens.
9. Factory fault limit: the 2nd confirmed faulty item in 12 months hides the factory at once, and an
   admin decides with the factory whether it continues (see "Decided on 6 Nov 2026").

## Not in this version

- Factory payouts (LKR 100/piece statements) and the rest of the 3–4 Nov dashboard plan
  (checklists, design drafts, inbox, chat) — still agreed, later release.
- Cash or bank refunds of any kind (`PAY-003` kept).
- Automatic removal of products or factories. (The fault limit hides a factory automatically;
  removal is still an admin decision.)
- Writing the legal text of the agreement — GroupBasket supplies it.

## Constraints

- The agreement text and the "remove without notice" clause need review by a Sri Lankan lawyer;
  the system records acceptance, it does not make the text legally valid.
- NIC, BR and bank documents are private: only Factories admins and the core admin may open them.
- Money uses the existing decimal rules; one active cart per buyer and one factory per cart stay.
- Phone first, low running cost, no paid services.

## Success measures (proposed, not set by the owner)

- No factory can list a product without approved checks and an accepted, unexpired agreement.
- Every 1–2 star rating carries a report.
- A flagged product can be hidden, and a factory removed, by an admin in under a minute.
- Every member of a cancelled order receives the correct tokens, and no token is spent twice.

## Decided on 5 Nov 2026

- Only the core admin can change the commission.
- Old whole-factory ratings count towards the new factory score.
- The agreement may let GroupBasket hold back money a factory has already earned after a quality
  removal. The lawyer must confirm the wording.
- **Defect returns.** A buyer who receives a defective item can send it back to the factory. The
  buyer must apply within 2 days of delivery. If the return is accepted, the factory is not paid for
  that item and the buyer gets its value as tokens. There is still no cash or bank refund
  (`PAY-003`). The factory decides first. If the buyer disagrees, they can ask an admin, and the
  admin's decision is final. The buyer keeps the item until there is a decision. For an accepted
  defect return, a PickMe pickup takes the item from the buyer to the factory, and the factory pays.
  If the fault is the buyer's (for example, they chose the wrong size), the buyer pays the
  delivery. The item must come back unused with its tags. The buyer then gets tokens for the full
  item price, and the factory is not paid for that item.
- Tokens can be spent in a cart from any factory, and they can cover the whole price of an item.
- A rejected factory cannot apply again.

## Decided on 6 Nov 2026 (returns rebuild)

These replace any earlier return rule that conflicts with them. GroupBasket is strict with
factories.

- **Everyone sees every return.** When a buyer files a return, both the factory and the
  Factories/Core admins are notified. Admins can read it and its photos at once, but they decide only
  after the factory says no or misses its deadline.
- **The factory answers within 24 hours** (it was 48). No answer means the return goes to an admin.
  A missed deadline is not a fault by itself.
- **A fault** is each item that is confirmed as the factory's fault, either because the factory
  admits it or because an admin decides it. Buyer-fault returns (for example, the wrong size) never
  count. One return of 3 faulty shirts counts as 3 faults.
- **The limit is 1 fault in any 12 months**, counted day by day. The 2nd fault hides all the
  factory's listings at once.
- **A normal hide never changes a finished cart.** When an admin hides a product, items are removed
  only from carts that are still open. Once the cart owner presses Finish, nothing is removed,
  whether the cart is paid or not, and no cancellation tokens are given. (This replaces the 5 Nov
  rule that cancelled hidden items in accepted and paid carts.)
- **A 2nd-fault hide and a factory removal do change finished carts.** Every cart holds items from
  one factory only, so the whole cart is affected:
  - open carts: the factory's items are removed, as in a normal hide;
  - finished carts **not yet booked with PickMe**: cancelled. If paid, each member gets tokens for
    their own items. If not paid yet, no new tokens; tokens members had applied are given back;
  - carts **already booked with PickMe** or delivered: not cancelled; they go ahead.
    If the admin later lets the factory continue, cancelled carts stay cancelled.
- **Then an admin and the factory talk** and the admin decides: continue (listings shown again) or
  remove the factory. If the factory continues, its old faults still count until they are 12 months
  old, so the next fault hides it again.
- **Unchanged:** the buyer's 2-day window, a photo for factory-fault returns, the buyer keeps the
  item until a return is accepted, tokens and never cash, and every refusal goes to an admin, who
  discusses it with the factory in the private thread and makes the final decision.

### Example

Lanka Shirts admits a torn shirt on 10 March (1 fault, allowed). On 5 June an admin decides a
badly stitched shirt is its fault (2 faults): its listings are hidden at once. On 8 June the admin
talks with the factory and lets it continue. On 20 July another shirt is confirmed faulty: March
and June still count, so Lanka Shirts is hidden again.

## Open questions

- How much weight do old whole-factory ratings carry against the new product ratings? This is a
  Spec step question.
