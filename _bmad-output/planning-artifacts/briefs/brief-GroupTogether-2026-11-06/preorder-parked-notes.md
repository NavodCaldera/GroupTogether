---
title: "Preorders: parked notes"
status: paused, not completed
created: 2026-11-07
---

# Preorders: parked notes

**Not completed and not approved policy.** The owner paused this work on 2026-11-07. Do not build
any of it, and do not change an approved rule because of it. The record is `DEC-015` in
[decisions](../../../../docs/decisions.md). The dated history is in [.memlog.md](.memlog.md).

**Not parked:** many baskets, the 3-day basket lifetime, and design tests with likes are in the
factory dashboards rebuild (owner, 2026-11-07). They are listed below because preorders rely on
them, and their technical findings still apply.

## What the owner has said so far

1. A factory tests a design with a price, buyers like it, and the factory decides to sew. It takes
   preorders before sewing. The preorder price may differ from the later bulk price.
2. A factory needs at least LKR 10,000,000 in sales before it can take preorders.
3. A buyer can be in many baskets. Each buyer has a personal Preorder basket, which can hold items
   from several factories.
4. Preorders are placed only with tokens. A buyer gets tokens through a deposit of at least LKR
   20,000; a smaller deposit creates no tokens. These are ordinary tokens, and the Preorder basket
   stays open when the balance is below 20,000.
5. Pressing Place reduces the buyer's tokens. The factory sews if its target is reached.
6. When the item is ready, the buyer gets a message and moves it into their own basket or someone
   else's group basket. An order needs a basket of at least LKR 50,000. Token-paid value counts
   toward that, and the basket owner transfers the rest.
7. If a group basket expires, preorder lines return to that buyer's Preorder basket. Other lines
   release as normal. Basket lifetime becomes 3 days.
8. A failed preorder gives tokens only, no cash.
9. A ready item has a 6-month limit, as an admin setting. If it isn't ordered by then, the factory
   can keep the item or sell it on the platform.
10. The factory is paid when the target is reached and it closes preorders.
11. A paid factory must repay before a preorder is cancelled. It can't cancel until it has repaid.
12. If items aren't ready by the ready date, admins review and decide whether to cancel.
13. The repayment deadline is the ready date. From that day, GroupBasket deducts the money from the
    factory's normal sales.
14. If the factory refuses to repay, GroupBasket gives the buyer tokens. The factory still owes the
    money, and new preorders stay blocked until it is paid.

## Assumed, not confirmed

- The buyer gets full tokens back when the 6-month limit ends.
- The 6 months starts at the ready message and keeps running through basket expiries.
- "Paid" means the full factory price.
- Many baskets and the 3-day lifetime apply to all baskets.
- Deductions for a late preorder run once admins decide to cancel it.

## Questions still open

1. **Question 25, in progress:** when do tokens and deductions start for a lapse, an accepted return
   or a hold or removal? The recommendation was the same day, which keeps RETURN-001 unchanged. The
   owner hadn't answered when work paused.
2. How is LKR 10,000,000 counted: basis, period, and whether it's kept once earned? The
   recommendation was delivered value at buyer price, minus returns and cancellations.
3. Is the factory paid in full or in part at close? Is commission kept until delivery?
4. What happens to a transfer below LKR 20,000, given no tokens and no cash refunds? Can a buyer top
   up with less?
5. When are factories paid on ordinary orders, given that debts are deducted from normal sales?
6. Can a factory sell expired pieces before it has repaid?
7. Can a buyer leave after pressing Place?
8. Who sets the target, dates and maximum pieces, and do admins approve them?
9. If fewer pieces are made than were placed, who gets them?
10. Does a late or failed batch count as a fault under FAULT-001?
11. Should there be a limit on baskets per buyer? One buyer can reserve unlimited stock across many
    baskets for 3 days.

Lawyer or accountant review is needed for holding deposits before goods exist, for deducting debts
from factory money, and for any new agreement clause. None of this has been researched.

## Technical findings to recheck

These came from read-only agents on 2026-11-07, without running code. Recheck them before design.

- **Exit paths:** expiry, cancel, leave, remove and hidden-product cleanup all release tokens and
  return pieces to public sale (`src/server/carts/service.ts`). A token-paid preorder line needs a
  separate preorder record and a return-to-waiting outcome.
- **Quantities:** raising a line's quantity would give extra pieces the preorder price, and the
  unique key on cart, user and variant blocks separate preorder and bulk lines.
- **Holds and removal:** cleanup finds baskets through cart lines, so waiting preorders are missed
  (`src/server/quality.ts`).
- **Many baskets:** one-cart checks, `mergeSource` and single-basket buyer and admin screens all need
  changing. Roughly 10 to 15 source files, plus tests.
- **Deposits:** `PaymentSlip.cartId` is required and slip review needs a basket, so deposits need
  their own slip record, with the admin entering the amount received. Tokens have no deposit type.
- **Factory money:** no factory balance or payout record exists. Cart lines don't capture factory
  price or commission, and `notEarned` is written but not read.
- **What already fits:** the 50,000 count uses gross line value, `amountDue` subtracts applied
  tokens, and zero-due confirmation exists. Packing needs no new gate if lines enter baskets only
  after the ready message.

## Suggested order when this resumes

1. Deposits and tokens, after legal review.
2. Preorder campaigns.
3. Factory money, repayment and debts, after legal review and a new factory agreement.

Before giving this priority, check how many real factories have reached LKR 10,000,000.
