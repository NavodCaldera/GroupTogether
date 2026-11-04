---
title: Factory partnership — trust from the first day
status: approved
created: 2026-11-04
updated: 2026-11-05
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
   and unpaid cart items are removed at once. For each paid order the admin chooses: let the factory
   finish it, or cancel it. Money already earned is reviewed case by case.
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
8. Return applications within 2 days of delivery: the factory decides, the buyer can ask an admin,
   and an accepted return is paid back as tokens.

## Not in this version

- Factory payouts (LKR 100/piece statements) and the rest of the 3–4 Nov dashboard plan
  (checklists, design drafts, inbox, chat) — still agreed, later release.
- Cash or bank refunds of any kind (`PAY-003` kept).
- Automatic removal of products or factories.
- Writing the legal text of the agreement — GroupBasket supplies it.

## Constraints

- The agreement text and the "remove without notice" clause need review by a Sri Lankan lawyer;
  the system records acceptance, it does not make the text legally valid.
- NIC, BR and bank documents are private: only Factories admins may open them.
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

## Open questions

- How much weight do old whole-factory ratings carry against the new product ratings? This is a
  Spec step question.
