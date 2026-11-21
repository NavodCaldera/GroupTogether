# Feature Specification: Orders in four stages

**Feature Branch**: `feat/004-orders-four-stages`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Orders in four stages, no buyer cancelling, own-basket payments
view." Owner's words, 2026-11-21: "lets make it into - Filling, Packing, On the way, delivered.
when the minimum count reached basket owner has to place the order. then only it starts packing.
… there is nothing called cancel because after making a payment can't cancel it." "lets reduce
that to 10 days. then that order will get cancelled they will get the token back automatically,
other than that buyer can't cancel the order." "It should display who are the other buyers that
have joined the basket, and what they have bought … the payment by each person with item fees,
PayHere fees, and the current total of the basket."

Research inputs (2026-11-21, read-only agents): business-rules review, order data and actions
audit, and a UX review of the order page.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See every order by stage (Priority: P1)

A buyer opens Orders, picks how they bought (Agent pickup, My baskets, Joined baskets) and sees
their orders grouped as Filling, Packing, On the way and Delivered, each card showing the same
four-stage tracker.

**Why this priority**: The orders list is where buyers check progress most often; one stage
vocabulary everywhere removes the confusing "Paid" step and the separate "Packing" line.

**Independent Test**: Sign in as a buyer with orders in different basket states, open each tab
and check the group headings, counts and each card's current stage.

**Acceptance Scenarios**:

1. **Given** an order whose basket is open, **When** the buyer opens its tab, **Then** it is
   listed under "Filling" and its tracker marks Filling as current.
2. **Given** an order whose basket is locked or packed, **Then** it is under "Packing".
3. **Given** an order whose basket is with the courier, **Then** it is under "On the way".
4. **Given** an agent order at the agent (ready or collected) or an own basket delivered,
   **Then** it is under "Delivered".
5. **Given** an own basket cancelled by the wait rule, **Then** its order is under "Refunded" at
   the bottom of the tab.
6. **Given** an order that was never paid, **Then** it is not listed.
7. **Given** a stage group with no orders, **Then** that heading is not shown.

---

### User Story 2 - Owner runs and checks their basket from the order page (Priority: P1)

The owner of an own basket opens its order (My baskets) and sees, on one page: the stage, the
tracker with dates, how many items of the minimum the basket has, the actions for that stage,
the delivery address, and a Buyers card with each buyer, what they bought and what they paid,
followed by the basket totals.

**Why this priority**: The owner decides when to place the order and pays the courier; they need
the whole basket, including money, without opening another page.

**Independent Test**: As an owner whose basket has a joiner, open the order and compare each
buyer's item amount, PayHere fee and paid amount, and the basket totals, with the orders' records.

**Acceptance Scenarios**:

1. **Given** the basket is filling and short of the minimum, **Then** the page heading reads
   "Filling", the item count shows "N of M items · needs K more", Share basket and Who can join
   are available and Place order is disabled.
2. **Given** the basket has reached the minimum, **When** the owner taps Place order, **Then**
   the basket moves to Packing and the owner actions for Filling disappear.
3. **Given** the basket is on the way, **Then** a Received button is shown; tapping it moves the
   basket to Delivered.
4. **Given** any stage, **Then** the Buyers card lists the owner first ("You") and then every
   other buyer with each item (product, size, quantity, item amount), their PayHere fee, tokens
   used (only if any) and the amount paid.
5. **Given** any stage, **Then** below the buyers the card shows the basket's item count, items
   amount, PayHere fees, total, and "Courier fee: On delivery" until the basket is delivered.
6. **Given** a basket where one buyer paid twice (added more), **Then** that buyer appears once
   with all their items and summed amounts.

---

### User Story 3 - No cancelling after payment (Priority: P1)

Once a buyer has paid, no order page offers Cancel and the system refuses any buyer cancel.

**Why this priority**: The owner's rule: a paid order cannot be cancelled by the buyer.

**Independent Test**: Open a paid order whose basket is still filling; there is no Cancel control,
and a direct cancel request from that buyer is refused.

**Acceptance Scenarios**:

1. **Given** a paid order in a filling basket, **Then** the order page shows no Cancel control.
2. **Given** a buyer submits a cancel request for their paid order by any means, **Then** it is
   refused and the order stays paid.

---

### User Story 4 - Own basket wait of 10 days (Priority: P2)

An own basket the owner has not placed within 10 days of its first payment is handled
automatically: placed if it holds the minimum, otherwise cancelled with every buyer refunded as
tokens.

**Why this priority**: Buyers should not wait long for a basket that is not filling; nobody has
to ask for money back.

**Independent Test**: Create an own basket whose first payment is 10 days old, short of the
minimum; run the timed check; every buyer's order is cancelled and their tokens credited.

**Acceptance Scenarios**:

1. **Given** an own basket open for 10 days below the minimum, **When** the timed check runs,
   **Then** the basket and its orders are cancelled and each buyer is credited their refund as
   tokens and notified.
2. **Given** an own basket open for 10 days at or above the minimum, **Then** it is placed
   automatically and moves to Packing.
3. **Given** an own basket open for 9 days, **Then** nothing happens yet.
4. **Given** an agent basket, **Then** its maximum wait stays separate (60 days by default).

---

### User Story 5 - Joiner sees the basket without others' money (Priority: P2)

A buyer who joined someone's own basket opens their order (Joined baskets) and sees the stage,
tracker, item count, the owner's area, the other buyers by first name with what they bought,
and their own payment — but not the owner's address or other buyers' payments.

**Why this priority**: Joiners want to know the basket is real and filling; other people's money
and the owner's address stay private.

**Independent Test**: As a joiner, open the order; check other buyers show first names and items
only, the owner address is absent and only the joiner's own payment is shown.

**Acceptance Scenarios**:

1. **Given** a joiner's order, **Then** the Buyers card shows "You" with their items and payment,
   and each other buyer by first name with items and quantities only.
2. **Given** a joiner's order, **Then** no owner actions, address or phone are shown.

---

### Edge Cases

- A buyer with an unpaid order still on hold: not listed until paid; if the hold lapses it never
  appears.
- Lines reported missing or returned: the item amount shows what was bought; the refund for
  missing items is shown on that line ("Missing N").
- An agent basket locked by suspension of its agent: shown under Packing like any locked basket.
- A legacy order with a courier or agent fee above zero keeps those rows in its payment.
- Token-only payments: no PayHere fee row when the fee is zero.
- A buyer whose name is a single word: first name is the whole name.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every order MUST map to exactly one stage: Filling (basket open), Packing (locked
  or packed), On the way (with the courier), Delivered (at the agent, collected, or own basket
  delivered); an own basket cancelled by the wait rule maps to Refunded.
- **FR-002**: The order tracker MUST show the four stages Filling, Packing, On the way, Delivered,
  with the date under each reached stage (first payment, basket locked, given to the courier,
  arrived or delivered); the "Paid" step MUST be removed.
- **FR-003**: The Orders page MUST keep the tabs Agent pickup, My baskets, Joined baskets and,
  within each tab, group orders under Filling, Packing, On the way, Delivered, then Refunded,
  hiding empty groups and showing each group's count.
- **FR-004**: Orders that were never paid MUST NOT be listed.
- **FR-005**: Buyers MUST NOT be able to cancel a paid order: no Cancel control anywhere, and the
  system MUST refuse buyer cancel requests.
- **FR-006**: An own basket MUST move from Filling to Packing only when its owner places it at
  or above the minimum item count, or when the wait rule places it.
- **FR-007**: An own basket open for the own-basket maximum wait (10 days by default, an admin
  setting separate from the agent basket wait) since its first payment MUST be placed
  automatically if it holds the minimum, otherwise cancelled with every buyer refunded as tokens
  and notified.
- **FR-008**: The order page heading MUST be the order's stage (Filling, Packing, On the way,
  Delivered, Refunded).
- **FR-009**: For an own basket, the owner's order page MUST show a Buyers card: every buyer
  (owner first as "You", then others by full name), each with their items (product, size,
  quantity, item amount), PayHere fee, tokens used if any, and amount paid; then the basket item
  count, items amount, PayHere fees, total and the courier fee as "On delivery" until delivered.
- **FR-010**: For an own basket, a joiner's order page MUST show the Buyers card with "You"
  (items and payment) and other buyers by first name with items only; no owner address, phone,
  or other buyers' money.
- **FR-011**: Owner actions MUST follow the stage: Share basket, Who can join and Place order
  (enabled at the minimum) while Filling; Received while On the way; none otherwise.
- **FR-012**: Agent pickup order pages MUST keep the pickup point and, when delivered and
  uncollected, show the pickup code, the pieces and the cash agent fee for that pickup.
- **FR-013**: No fact MUST appear twice on one screen (stage word, product title, item count,
  agent or owner name), and the pages MUST contain no explanation sentences.
- **FR-014**: The pages MUST work at 360 px width with 44 px tap targets and in dark mode.

### Key Entities

- **Order**: one buyer's payment into a basket; has items, PayHere fee, tokens used and amount
  paid; belongs to one basket.
- **Basket**: agent basket (pickup) or own basket (delivered to its owner); has a status that maps
  to a stage, a first-payment time, lock time, courier hand-off time and delivery time.
- **Stage**: Filling, Packing, On the way, Delivered, or Refunded; derived from the basket and
  order status.
- **Buyer in a basket**: a person with one or more paid orders in the same own basket; shown once
  with combined items and amounts.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A buyer can tell any order's stage from the Orders page without opening it, in every
  tab.
- **SC-002**: An own-basket owner can see who joined, what each bought and the basket total on one
  page, with no further navigation.
- **SC-003**: The basket total on the owner's page equals the sum of every buyer's paid amount
  plus tokens used, to the cent.
- **SC-004**: No paid order can be cancelled by a buyer.
- **SC-005**: Every own basket is placed or refunded within one day after its 10-day wait ends.
- **SC-006**: The order and orders pages pass the automated accessibility scan and show no
  horizontal scroll at 360 px.

## Assumptions

- The refund on a wait-rule cancel follows the existing rule: everything paid comes back as
  tokens, PayHere fee included (tokens used plus the whole online payment).
- "Delivered" for agent pickup includes both "ready at the agent" and "collected"; the pickup code
  shows while any item is uncollected.
- The basket total is the sum of what every buyer paid (items + PayHere fee; tokens counted as
  paid); the courier fee is paid by the owner on delivery and has no amount in the system.
- The timed check already runs daily (the sweep); only its own-basket wait length changes.
- The basket page reached through a share link stays for people joining; it is not changed beyond
  using the new stage names.
- Admin, factory and agent screens keep their own status words.
