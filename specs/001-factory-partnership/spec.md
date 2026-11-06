# Feature Specification: Factory partnership

**Feature Branch**: `main` (no feature branch; specs directory only)

**Created**: 2026-11-05

**Status**: Approved (2026-11-05)

**Input**: Approved product brief `_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-04/brief.md`, first-version items 1–8.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A factory joins through checks and an agreement (Priority: P1)

A factory owner or manager applies on a public form, or accepts an invite from a Factories admin.
They upload proof of the business, the owner's identity, the address and the bank account. A
Factories admin reviews the proof and approves or rejects it. After approval the owner signs in and
must accept the current agreement before doing anything else.

**Why this priority**: Every other part depends on knowing who the factory is and having an agreed
basis for the partnership.

**Independent Test**: Submit an application, approve it, accept the agreement, and confirm the
factory can list a product only after acceptance.

**Acceptance Scenarios**:

1. **Given** a visitor on the public application form, **When** they submit BR number, BR
   certificate, owner NIC number, NIC photo, factory address, factory photos and bank details,
   **Then** an application is created as "waiting for review" and Factories admins see it.
2. **Given** a Factories admin, **When** they send an invite to an owner's phone or email, **Then**
   the owner can open the invite and fill in the same application.
3. **Given** an application missing any required item, **When** it is submitted, **Then** it is
   refused and the missing items are named.
4. **Given** an application whose bank account name matches neither the business nor the owner,
   **When** an admin reviews it, **Then** the admin cannot approve it until the mismatch is fixed.
5. **Given** an approved factory whose owner has not accepted the agreement, **When** the owner
   tries to list a product or add a staff member, **Then** they are stopped and shown the agreement.
6. **Given** the owner accepts the agreement, **Then** the system keeps who accepted, when, and
   which version, and the agreement runs for 12 months from that day.
7. **Given** a rejected application, **When** the same business (BR number) or owner (NIC number)
   applies again, **Then** the application is refused.

---

### User Story 2 - Buyers see the price including commission (Priority: P1)

The factory sets the amount it receives per piece. Buyers see that amount plus GroupBasket's
commission. Only the core admin can change the commission; a change applies to listings created
afterwards.

**Why this priority**: It changes every price buyers see and every amount factories earn.

**Independent Test**: List a product at LKR 1,400 with commission LKR 100 and check the buyer
price is LKR 1,500; change commission to LKR 120 and check the old listing stays LKR 1,500 while a
new one shows the new total.

**Acceptance Scenarios**:

1. **Given** commission LKR 100, **When** a factory lists a product at LKR 1,400, **Then** buyers
   see LKR 1,500.
2. **Given** the core admin changes commission to LKR 120, **Then** existing listings keep their
   price and only new listings use LKR 120.
3. **Given** a Factories admin or any other user, **When** they try to change the commission,
   **Then** they are refused.

---

### User Story 3 - Agreement renewal and expiry (Priority: P2)

The owner is reminded 30 days before the agreement ends. If it is not renewed, the factory's
listings are hidden on the end date, and orders that are already paid are still delivered. When
the core admin publishes a new agreement version, the owner must accept it before selling
continues.

**Why this priority**: Keeps every selling factory under a valid agreement.

**Independent Test**: Set an agreement end date 30 days ahead and check the reminder; pass the end
date and check listings are hidden while paid orders continue.

**Acceptance Scenarios**:

1. **Given** an agreement ending in 30 days, **Then** the owner receives a reminder.
2. **Given** the end date passes without renewal, **Then** listings are hidden from buyers, paid
   orders continue to fulfilment, and no new listings can be created.
3. **Given** a new agreement version is published, **Then** every owner must accept it before
   listing or selling again, and acceptance starts a new 12-month term.

---

### User Story 4 - Rating and reporting each product (Priority: P2)

A buyer who received an item rates that product, once per product per order. A rating of 1 or 2
stars needs a report with a reason. A photo is required when the reason is a visible problem
(damaged, wrong item, stitching) and optional otherwise. Each product has its own score; the
factory's score is built from its products' ratings plus its old whole-factory ratings.

**Why this priority**: Gives GroupBasket the quality signal it needs to act.

**Independent Test**: As a receiver, rate a product 2 stars without a report and be refused; add a
"stitching" report without a photo and be refused; add the photo and succeed.

**Acceptance Scenarios**:

1. **Given** a buyer whose item was delivered, **When** they rate the product, **Then** the rating
   is saved and counted in the product and factory scores.
2. **Given** someone who did not receive the item, **When** they try to rate it, **Then** they are
   refused.
3. **Given** a buyer has already rated a product in an order, **When** they try again for the same
   product in the same order, **Then** they are refused.
4. **Given** a 1 or 2 star rating, **When** no report reason is given, **Then** it is refused.
5. **Given** a report reason of damaged, wrong item or stitching, **When** no photo is attached,
   **Then** it is refused.

---

### User Story 5 - Flags, hiding a product, removing a factory (Priority: P2)

The system flags a product under 3.0 stars over 10 or more ratings, or with 3 reports in 30 days.
It flags a factory under 3.0 stars over 20 or more ratings, or with 3 or more flagged products.
A Factories admin may hide a flagged product or remove a factory. Nothing is removed automatically;
the only automatic action is the fault-limit hide in User Story 8.
Removal does not notify the factory.

**Why this priority**: The safety net that protects buyers from bad products.

**Independent Test**: Create enough low ratings to flag a product, hide it, and check buyers no
longer see it; remove a factory and check its listings vanish and unpaid cart items are removed.

**Acceptance Scenarios**:

1. **Given** a product reaches a flag condition, **Then** it appears in the admin's flag list and
   stays visible to buyers until an admin hides it.
2. **Given** an admin hides a product for a quality issue, **Then** only that product is affected:
   buyers can no longer see or add it and it is removed from OPEN/READY carts. Finished carts
   (the owner pressed Finish), paid or not, are unchanged and no tokens are given (owner,
   2026-11-06). The factory's other products are unaffected.
3. **Given** an admin removes a factory, **Then** all its listings vanish, its items are removed
   from open carts, its staff can no longer sign in, and no message is sent to the factory.
4. **Given** a removed factory, or a factory hidden by its 2nd fault, with finished carts not yet
   handed to PickMe, **Then** those whole carts are cancelled and each member is told the reason.
   Carts already handed to PickMe or delivered go ahead (owner, 2026-11-06).
5. **Given** such a cancelled cart was paid, **Then** each member receives tokens equal to the
   price of their own items. **Given** it was not paid yet, **Then** no new tokens are given and
   tokens members had applied are returned.

---

### User Story 6 - Tokens (Priority: P1)

Tokens replace money back. 1 token is worth LKR 1 and tokens never expire. A member spends tokens
only on items they themselves add to a cart, in a cart from any factory, and tokens may cover the
whole item price. Tokens lower the amount the cart owner transfers. The cart minimum counts the
full item value before tokens.

**Why this priority**: Without tokens, cancellations and returns leave buyers with nothing, and
`PAY-003` forbids cash refunds.

**Independent Test**: Give Kasun 3,000 tokens; Kasun adds a LKR 1,500 item to Nimal's cart and uses
1,500 tokens; Nimal's transfer is LKR 1,500 lower, and the cart minimum still counts LKR 1,500.

**Acceptance Scenarios**:

1. **Given** a member with tokens, **When** they apply tokens to their own item, **Then** the
   owner's transfer amount drops by that many rupees.
2. **Given** a member, **When** they try to apply tokens to another member's item, **Then** they are
   refused.
3. **Given** a member tries to apply more tokens than they hold, or more than the item price,
   **Then** they are refused.
4. **Given** tokens are applied, **Then** the cart minimum check uses the full item value.
5. **Given** the same tokens, **When** two carts try to spend them at the same moment, **Then** only
   one succeeds.

---

### User Story 7 - Returns (Priority: P2)

A buyer can apply to return an item within 2 days of delivery. The factory and FACTORY/CORE
admins are both notified at filing. The factory decides first, within 24 hours; its
refusal automatically goes to an admin, whose decision is final after private discussion with
the factory. The buyer keeps the item until the return is accepted. If the factory is at fault
(defect, wrong size or wrong item sent), the factory
pays the PickMe pickup. If the buyer is at fault (for example chose the wrong size), the buyer pays
delivery and the item must come back unused with its tags. For any accepted return the buyer
receives tokens for the full item price and the factory is not paid for that item.

**Why this priority**: Gives buyers protection against bad items without cash refunds.

**Independent Test**: Deliver an item, apply for a defect return on day 1, have the factory reject,
exchange private admin–factory messages, have the admin accept, receive the item, and check
the buyer receives tokens and the factory's earning for
that item is removed.

**Acceptance Scenarios**:

1. **Given** an item delivered more than 2 days ago, **When** the buyer applies, **Then** it is
   refused.
2. **Given** a return application, **Then** the buyer chooses a reason and states whether the fault
   is the factory's or their own; a photo is required for factory-fault reasons.
3. **Given** the factory accepts a factory-fault return, **Then** a pickup is booked at the
   factory's cost, and when the item reaches the factory the buyer receives tokens.
4. **Given** the factory accepts a buyer-fault return, **Then** the buyer arranges and pays for
   delivery, and tokens are given only after the factory confirms the item is unused with tags.
5. **Given** the factory refuses with a reason, **Then** the return moves automatically to
   WITH_ADMIN; an admin discusses it privately with owner/SALES and decides with a note.
   Rejection is final; acceptance gives tokens only after receipt.
6. **Given** a new return, **Then** the factory owner/SALES and FACTORY/CORE admins are notified;
   admins can read it and its photos but cannot decide until the factory refuses or 24 hours pass.
7. **Given** the factory has not answered 24 hours after filing, **Then** the return moves to
   WITH_ADMIN; the missed deadline is not a fault.

---

### User Story 8 - Factory fault limit (Priority: P1)

GroupBasket is strict with factories. Each item confirmed as the factory's fault is one fault. A
factory may have at most 1 fault in any 12 months; the 2nd hides the whole factory at once, and an
admin talks with the factory and decides whether it continues or is removed.

**Why this priority**: Protects buyers and the brand from repeat bad factories, fast.

**Independent Test**: Confirm one factory-fault item (allowed), then a second within 12 months;
check the factory's listings are hidden, its unhanded finished carts cancelled with the right
tokens, admins alerted; let it continue; confirm a third fault and check it is hidden again.

**Acceptance Scenarios**:

1. **Given** a factory-fault return the factory accepts, or an admin accepts as factory fault,
   **Then** each item in it counts as one fault (a return of 3 shirts is 3 faults).
2. **Given** a buyer-fault return, or a missed factory deadline, **Then** no fault is counted.
3. **Given** a factory reaches 2 faults within the last 12 months (rolling, day by day), **Then**
   all its listings are hidden at once, carts follow FR-021, and FACTORY/CORE admins are alerted.
4. **Given** a fault-hidden factory, **When** an admin decides "continue" with a note, **Then** its
   listings are shown again and cancelled carts stay cancelled; **When** the admin decides
   "remove", **Then** the normal removal applies.
5. **Given** a continued factory, **Then** its old faults keep counting until 12 months old, so
   the next confirmed fault hides it again.

---

### Edge Cases

- **Approved owner rule, 2026-11-06:** a buyer-fault item received used or without tags goes
  automatically to WITH_ADMIN with a required 1–1000 character condition reason and no tokens.
  This applies even after an admin accepted before arrival. Receipt is recorded once; one
  final admin decision accepts (one full-price credit, COMPLETED) or rejects (REJECTED, no
  credit and no further action). The buyer never requests escalation.
- **Approved owner rule, 2026-11-06:** the buyer keeps the item until acceptance. Pickup and
  receipt before approval are refused. Waiting UI shows only the approval status, with a
  send/pickup step after acceptance.
- The private return thread permits only own factory owner/SALES and FACTORY/CORE admins.
  Messages are 1–1000 characters, ten per minute per author, posted only WITH_ADMIN, and
  readable after decision. Buyers, another factory, other staff and other admin areas are denied.

- **Superseded on 2026-11-06 by FR-019a/FR-021** (kept for history): hiding/removing products after owner acceptance leaves AWAITING_SLIP/SLIP_REVIEW lines,
  totals and transfer amount frozen. Confirmation (including token-only acceptance) cancels hidden
  lines atomically with full-price token credits and reasons. A rejected slip that later times out
  releases normal reservations without cancellation credit. OPEN/READY removal resets member
  Done through existing paths. Delivered carts are unchanged. A fully cancelled dispatched cart
  retains Delivery and alerts warehouse admins for manual pickup handling (DEC-013, 2026-11-05).

- Tokens cover the whole cart (`amountDue` = LKR 0.00): owner acceptance immediately confirms
  it and spends the holds, without a bank slip, payment deadline or admin review. Stock sale,
  gift activation/brand events and confirmation/fulfilment notices match approved-slip effects.
  A positive remainder, even LKR 0.01, still requires the existing slip flow (DEC-013, 2026-11-05).

- An owner's agreement expires while their staff are mid-packing: paid orders continue; only
  listing and new sales stop.
- A product is hidden while it sits in a finished cart (paid or not): nothing changes in that
  cart (owner, 2026-11-06; replaces the earlier cancel-for-tokens rule).
- A factory is removed while a return for its item is open: the admin decides the return.
- A member with tokens leaves a cart before payment: their tokens are returned to them unspent.
- A cart that used tokens is cancelled by a factory removal: the member gets back both the tokens
  spent and the value paid, as tokens.
- The core admin sets commission to zero or a negative number: zero is allowed, negative refused.
- Two admins act on the same flagged product or the same return at once: only the first action
  counts.
- A factory does not answer a return application within 2 days: the return goes to an admin
  automatically.

## Requirements _(mandatory)_

### Functional Requirements

**Joining and checks**

- **FR-001**: System MUST offer a public factory application form and an admin invite that leads to
  the same form.
- **FR-002**: System MUST require BR number, BR certificate copy, owner NIC number, NIC photo,
  factory address, at least one factory photo and bank account details before an application can be
  submitted.
- **FR-003**: System MUST let a Factories admin record an optional factory visit and its notes.
- **FR-004**: System MUST let a Factories admin approve or reject an application, and MUST block
  approval when the bank account name matches neither the business nor the owner.
- **FR-005**: System MUST refuse new applications that reuse the BR number or owner NIC of a
  rejected application.
- **FR-006**: Identity, business and bank documents MUST be viewable only by Factories admins and
  the core admin, never by buyers, factory staff or the public.
- **FR-007a**: Factories already on GroupBasket when this goes live MUST complete the checks and
  accept the agreement within 30 days; their listings stay live during those 30 days and are hidden
  after day 30 until both are done.
- **FR-007**: Only the owner or manager is onboarded by GroupBasket; they add their own staff, and
  only after accepting the agreement.

**Agreement**

- **FR-008**: The core admin MUST be able to publish agreement versions; each version's text is kept
  unchanged after publishing.
- **FR-009**: System MUST record who accepted, when, and which version, and set a 12-month term
  from acceptance.
- **FR-010**: System MUST block listing, selling and adding staff until the current version is
  accepted and unexpired.
- **FR-011**: System MUST remind the owner 30 days before the end date.
- **FR-012**: On expiry, System MUST hide the factory's listings and keep paid orders in fulfilment.

**Commission and price**

- **FR-013**: Buyer price MUST equal factory price plus the commission in force when the listing was
  created; commission default LKR 100 per piece.
- **FR-014**: Only the core admin MAY change the commission; changes apply to new listings only.

**Ratings and reports**

- **FR-015**: Only a buyer who received an item MAY rate its product, once per product per order,
  1 to 5 stars.
- **FR-016**: A 1 or 2 star rating MUST include a report with a reason; reasons damaged, wrong item
  and stitching MUST include a photo.
- **FR-017**: System MUST show a score per product and a factory score combining all product
  ratings with the factory's old whole-factory ratings. Each old whole-factory rating counts the
  same as one product rating.

**Flags and removal**

- **FR-018**: System MUST flag a product under 3.0 average over 10+ ratings, or with 3 reports in 30
  days; and flag a factory under 3.0 over 20+ ratings, or with 3 or more flagged products.
- **FR-019**: Factories admins MUST be able to hide a product and remove a factory; System MUST NOT
  do either automatically.
- **FR-019a**: Hiding a product MUST affect only that product and only OPEN/READY carts. Finished
  carts (accepted, awaiting or under slip review, confirmed, dispatched), paid or not, MUST NOT
  change, and no cancellation tokens are given (owner, 2026-11-06).
- **FR-020**: Removing a factory MUST hide its listings, remove its items from open carts, end its
  staff access, and send no message to the factory.
- **FR-021**: Removing a factory, or a fault-limit hide (FR-036), MUST cancel its finished carts
  not yet handed to PickMe and tell each member the reason. Paid carts: each member gets tokens for
  their own items. Unpaid carts: no new tokens; applied token holds are released. Carts already
  handed to PickMe or delivered MUST NOT be cancelled (owner, 2026-11-06).
- **FR-022**: System MUST let an admin mark a removed factory's earned money as held, with a note;
  the release decision is manual.

**Tokens**

- **FR-023**: Tokens MUST be worth LKR 1 each, never expire, and belong to one person.
- **FR-023a**: Tokens given for a cancellation or return MUST equal the full price the buyer paid
  for the item, commission included; GroupBasket gives up its commission on that item.
- **FR-024**: A member MAY spend tokens only on their own items, in any factory's cart, up to the
  full item price.
- **FR-025**: Tokens spent MUST reduce the owner's transfer; the cart minimum MUST use the full item
  value.
- **FR-026**: Every token gain and spend MUST be recorded with its reason, and a token MUST never be
  spent twice.
- **FR-027**: Tokens held on an unpaid cart MUST return to the member if the item leaves the cart or
  the cart does not go ahead. When a member chooses to use tokens, the amount they owe for their
  item drops at once. If they remove the item, or the cart (theirs or someone else's) expires or is
  cancelled without payment, all those tokens return to them straight away. Tokens are finally
  spent only when the cart is paid.

**Returns**

- **FR-028**: A buyer MAY apply to return an item only within 2 days of its delivery.
- **FR-029**: The application MUST state a reason and who is at fault; factory-fault reasons need a
  photo.
- **FR-030**: The factory decides first, within 24 hours of the application (owner, 2026-11-06;
  was 2 days); if it does not answer
  in time, or refuses with a required reason, the return goes to an admin automatically.
  FACTORY/CORE admins discuss it privately with the factory owner/SALES and decide finally.
  A newly recorded used/untagged buyer-fault receipt reopens one final receipt review even
  after pre-arrival approval. Buyers have no escalation action.
- **FR-031**: For an accepted factory-fault return, a PickMe pickup is booked at the factory's cost.
  For an accepted buyer-fault return, the buyer pays delivery and the item must be unused with tags.
- **FR-032**: When an accepted return reaches the factory, the buyer MUST receive tokens for the
  full item price and the factory's earning for that item MUST be removed.
- **FR-033**: No cash or bank refund of any kind is offered (`PAY-003`).
- **FR-034**: At filing, System MUST notify the factory owner/SALES and FACTORY/CORE admins.
  Admins MAY view every return and its photos at once, but MUST NOT decide before WITH_ADMIN.

**Factory fault limit (owner, 2026-11-06)**

- **FR-035**: A fault is recorded per item (unit) at the moment a FACTORY-fault return is accepted
  by the factory or an admin (not at receipt); its 12 months start then. Buyer-fault returns, rejected returns and missed deadlines record none.
- **FR-035a**: A FACTORY/CORE admin MAY cancel a mistaken fault with a required note; it stays in
  history marked cancelled and no longer counts. Cancelling does not by itself un-hide a factory;
  the admin's FR-037 decision does.
- **FR-036**: When a factory has 2 or more faults within the last 12 months, System MUST at once
  hide all its listings, apply FR-021 to its carts, and alert FACTORY/CORE admins.
- **FR-036a**: The factory owner MUST see its counted faults and their dates on its Returns page,
  and MUST get an in-app notice when it is fault-hidden (unlike removal, which sends nothing).
- **FR-036b**: While fault-hidden, the factory's staff MAY sign in, answer returns and post in
  return threads, but MUST NOT publish, edit into view or show any listing until FR-037.
- **FR-037**: An admin MUST decide a fault-hidden factory: continue (listings shown again) or
  remove (normal removal), with a required note. Cancelled carts stay cancelled.
- **FR-037a**: Each fault hold MUST have a private thread between FACTORY/CORE admins and the
  factory owner(s): posting only while the factory is fault-hidden, readable afterwards by the
  same people, same limits as return threads (1–1000 characters, 10 per minute). Buyers, staff
  of other jobs, other factories and other admin areas are denied.
- **FR-038**: Faults stay counted for 12 months from when they were recorded, including after a
  "continue"; every new fault while 2+ are within 12 months hides the factory again.

### Key Entities

- **Factory application**: applicant details, documents, status (waiting, approved, rejected),
  reviewer, optional visit notes, invite link if any.
- **Agreement version**: version number, text, published date, publisher.
- **Agreement acceptance**: factory, person, version, accepted time, end date.
- **Commission setting**: amount per piece, from date, set by.
- **Product rating**: product, order, rater, stars, time.
- **Quality report**: rating, reason, photos, note.
- **Flag**: product or factory, reason, raised time, admin action.
- **Factory removal**: factory, admin, time, reason, decisions per paid order, money-held note.
- **Token entry**: person, amount (+ or −), reason (cancellation, return, spend, release), link to
  the cart, order or return.
- **Return application**: item, buyer, reason, fault side, photos, factory decision, escalation,
  admin decision, pickup, token entry.
- **Factory fault**: factory, return, item count, recorded time, who confirmed (factory/admin).
- **Fault hold**: factory, hidden time, admin decision (continue/remove), note, decided time.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of products listed come from factories with approved checks and an accepted,
  unexpired agreement.
- **SC-002**: 100% of 1–2 star ratings carry a report.
- **SC-003**: An admin can hide a flagged product, or remove a factory, in under one minute.
- **SC-004**: Every member of a cancelled order receives the correct tokens, and no token is spent
  twice.
- **SC-005**: 100% of return applications made after 2 days of delivery are refused.
- **SC-006**: An owner can complete the application on a phone in under 15 minutes.

## Clarifications

### Session 2026-11-05

- Q: What if a factory does not answer a return application? → A: It has 2 days; after that the
  return goes to an admin automatically.
- Q: How much do old whole-factory ratings count? → A: Each counts the same as one new product
  rating.
- Q: What happens to tokens on an unpaid cart? → A: The member's amount drops when they choose
  tokens; if the item is removed or the cart expires or is cancelled unpaid, all tokens return at
  once.
- Q: What happens to factories already selling before the checks existed? → A: 30 days to
  complete checks and accept the agreement; listings hidden after day 30 until done.
- Q: How does a removed factory finish paid orders? → A: It does not; all its undelivered paid
  orders are cancelled, each buyer is told the reason and receives tokens. (Replaces the earlier
  per-order "finish or cancel" choice.)
- Q: Who can open the private documents? → A: Factories admins and the core admin.
- Q: Do tokens equal the price paid or only the factory's share? → A: The full price the buyer
  paid, including commission.
- Q: What happens to paid orders when one product is hidden? → A: Only that item is cancelled;
  buyers get tokens for it.

### Session 2026-11-06 (returns rebuild, owner)

- Q: How long does the factory have to answer? → A: 24 hours; then an admin. (Replaces 2 days.)
- Q: Who hears about a new return? → A: The factory and FACTORY/CORE admins; admins watch but
  decide only after a refusal or timeout.
- Q: What is a fault? → A: Each item confirmed as factory fault by the factory or an admin.
  Buyer-fault returns and missed deadlines never count.
- Q: How many faults are allowed? → A: 1 in any rolling 12 months; the 2nd hides the factory and
  an admin discusses with it, then continues or removes it. Old faults keep counting after
  "continue".
- Q: Does hiding change finished carts? → A: A normal product hide never does. A fault-limit hide
  or a removal cancels finished carts not yet handed to PickMe (tokens if paid; applied tokens
  back if unpaid). (Replaces "only that item is cancelled" above and the removal answer above for
  dispatched carts.)

- Q: When is a fault counted? → A: When the return is accepted as factory fault, not at receipt.
- Q: Can a mistaken fault be undone? → A: Yes, a FACTORY/CORE admin cancels it with a note; it
  stays in history and stops counting.
- Q: Is the factory told? → A: The owner sees its faults and dates, and gets a notice when hidden.
- Q: What can a hidden factory do? → A: Sign in, answer returns and threads; no listings shown.
- Q: Where is the continue/remove discussion? → A: A private factory thread (admins and owner),
  open while hidden, readable after.

## Assumptions

- The agreement text and the "remove without notice" and "hold earned money" clauses are supplied
  by GroupBasket and reviewed by a Sri Lankan lawyer; the system only records acceptance.
- Ratings are 1 to 5 stars, matching the existing factory rating.
- "Several flagged products" for a factory flag means 3 or more.
- Existing rules stay: only the cart owner pays (`PAY-001`), cart minimum (`CART-001`), one active
  cart per buyer (`CART-003`), one factory per cart (`FUL-001`).
- Factory payouts are out of this version; "factory not paid for that item" means the item is
  marked as not earned for later payout.
- Admin decision on an escalated return is final.
