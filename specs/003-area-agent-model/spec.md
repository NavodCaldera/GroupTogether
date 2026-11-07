# Feature Specification: Area agent model

**Feature Branch**: `main` (no feature branch, by owner instruction)

**Created**: 2026-11-07

**Status**: Draft

**Input**: Approved brief
[brief-GroupTogether-2026-11-07](../../_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-07/brief.md)
and its `.memlog.md`; later overrides win.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Buyer pays and joins an agent's basket (Priority: P1)

A buyer picks clothes, chooses a collection agent (nearest by default) and pays upfront. The paid
order joins that agent's open basket for the factory.

**Why this priority**: Without paid orders there is nothing for agents or factories to do. It is
the core of the low-cost promise.

**Independent Test**: A buyer with a pin buys one item through the demo gateway and the order
appears in the chosen agent's open basket for that factory.

**Acceptance Scenarios**:

1. **Given** a buyer with a pin and items from one factory, **When** they open checkout, **Then**
   the nearest active agent is pre-selected with its distance, and they can change it to any
   active agent.
2. **Given** a LKR 1,000 item, LKR 40 courier charge, LKR 20 agent fee, no tokens and a 3.3% fee
   rate, **When** checkout shows prices, **Then** it shows Item 1,000.00, Courier 40.00, Agent fee
   20.00, PayHere fee 36.02 and Total 1,096.02.
3. **Given** tokens worth LKR 300, **When** the buyer applies them, **Then** the PayHere fee is
   charged only on the remainder.
4. **Given** tokens cover the whole total, **When** the buyer confirms, **Then** no gateway payment
   is made and the order joins the basket.
5. **Given** a buyer pays successfully, **When** the gateway's signed notice arrives, **Then** the
   order joins the open basket exactly once, even if the notice repeats.
6. **Given** a cart with items from two factories, **When** the buyer pays, **Then** each factory's
   items join that agent's basket for that factory.

---

### User Story 2 - Basket locks and goes to the agent (Priority: P1)

A basket locks automatically at LKR 50,000, or ships at 2 months. The factory packs it, admin
books the courier, and the agent receives it.

**Why this priority**: This is how factories clear stock quickly.

**Independent Test**: Push a basket past LKR 50,000 and follow it through Packed, courier booked,
Given to driver and Received.

**Acceptance Scenarios**:

1. **Given** an open basket at LKR 49,000, **When** a LKR 3,000 order is paid, **Then** the whole
   order joins, the basket locks at LKR 52,000, and a new open basket starts for that agent and
   factory.
2. **Given** an open basket under LKR 50,000 whose first order is 2 months old, **When** the time
   passes, **Then** the basket locks and ships.
3. **Given** a locked basket, **When** the factory's Packing staff finish the checklist with a
   photo and tap Packed, **Then** it appears in admin's Courier to book.
4. **Given** admin enters the courier fee and driver details, **When** Packing taps Given to driver,
   **Then** the agent sees it in Arriving today with the fee to pay.
5. **Given** the agent taps Mark received, **Then** the agent is credited the booked courier fee in
   tokens, each buyer is notified with a pickup code, and each buyer's 48 hours start.

---

### User Story 3 - Buyer collects from the agent (Priority: P1)

**Why this priority**: It completes the buyer's purchase.

**Independent Test**: The agent types a buyer's 6-digit code, sees the items and hands them over.

**Acceptance Scenarios**:

1. **Given** a received order, **When** the agent types the buyer's code, **Then** the screen
   lists the items to hand over and a Hand over button.
2. **Given** a wrong code, **When** typed, **Then** nothing is shown except that the code was not
   found.
3. **Given** a buyer who never collects, **When** time passes, **Then** the parcel stays in Waiting
   for pickup with no time limit.

---

### User Story 4 - Factory is paid every Sunday (Priority: P1)

**Why this priority**: This is the factory's time promise, and its only cash flow.

**Independent Test**: Items received by an agent more than 48 hours before Saturday 11:59 pm, with
no open return, appear on that factory's payout. A Core admin marks it paid with a bank reference.

**Acceptance Scenarios**:

1. **Given** an item received on Wednesday with no return, **When** Saturday 11:59 pm passes,
   **Then** it is included in Sunday's payout at the factory price.
2. **Given** an item with an open return, **When** the cutoff passes, **Then** it is held until the
   return is decided or cancelled.
3. **Given** deductions such as factory-fault return courier charges or missing items, **When**
   the payout is built, **Then** they are subtracted and listed on the statement.
4. **Given** a Core admin enters a bank reference, **When** they mark it paid, **Then** the factory
   Owner sees it in payout history.

---

### User Story 5 - Returns through agents (Priority: P2)

**Acceptance Scenarios**:

1. **Given** a received order, **When** the buyer files a return within 48 hours with photos,
   **Then** the factory's Sales staff have 24 hours to accept or refuse.
2. **Given** a refused or timed-out return, **Then** a Factory admin decides.
3. **Given** an accepted return, **Then** the buyer is told which agent to hand it to, and that
   agent sees it in Returns to collect with a 7-day countdown.
4. **Given** the agent marks the return collected, **Then** the buyer gets full-price tokens for a
   factory fault, or the item price minus the courier charge for a buyer fault.
5. **Given** a factory fault, **Then** the return courier charge is deducted from the factory's
   payout.
6. **Given** 7 days pass without handover, **Then** the return is cancelled and the factory is paid
   for the item the next Sunday.

---

### User Story 6 - Tokens for everyone except factories (Priority: P2)

**Acceptance Scenarios**:

1. **Given** an agent marks items received, **Then** LKR 20 per item is credited in tokens every
   Sunday.
2. **Given** any user with tokens, **When** they send an amount to another user, **Then** it moves
   immediately, appears in both histories and cannot be undone.
3. **Given** a payment arrives late or twice, **Then** the extra amount becomes the buyer's tokens.
4. **Given** a paid item the factory cannot supply after locking, **When** a Factory admin removes
   the line, **Then** the buyer gets full tokens, including courier charge and agent fee, and the
   cost is deducted from the factory's next payout.

---

### User Story 7 - Becoming and running an agent (Priority: P2)

**Acceptance Scenarios**:

1. **Given** an applicant within 2 km of an active agent, **When** admin reviews them, **Then** the
   application shows the clash and cannot be approved.
2. **Given** an approved applicant, **When** they pay the LKR 200,000 deposit and the PayHere fee,
   **Then** they go live.
3. **Given** a suspended agent, **Then** buyers can't choose them, their open baskets lock early and
   ship, and buyers still collect there.
4. **Given** an agent leaves, **When** an Agents and orders admin records losses with photos and a
   reason, **Then** the deposit minus losses is returned as tokens.

---

### User Story 8 - Old features removed or parked (Priority: P3)

**Acceptance Scenarios**:

1. **Given** the new system, **Then** buyer-run group baskets, join requests, merging, invites,
   discovery, bank slips, slip review, packing staff, warehouse, lots, price changes, samples, stock
   offers, owner chat and bank details in Settings are gone.
2. **Given** premium brands and design likes, **Then** they are hidden and their data is kept.

### Edge Cases

- A gateway notice is forged, or its amount or currency differs from the order: it is rejected,
  and nothing joins a basket.
- The buyer returns from the gateway before the notice arrives: they see "checking", and the order
  is never confirmed by the browser return alone.
- The buyer opens two checkouts for the same cart: only one payment can succeed for the order, and
  any second payment becomes tokens.
- An agent is suspended while a buyer is paying: the order goes to that agent's basket, which then
  locks early.
- A courier trip fails: Packing records Parcel is back and admin rebooks.
- A buyer has no pin: they must set one before checkout.
- Token balance would go below zero: the action is refused.

## Requirements _(mandatory)_

### Functional Requirements

**Buying and payment**

- **FR-001**: Buyers MUST be able to put items from any factory into one personal cart. The cart
  MUST NOT reserve stock.
- **FR-002**: Checkout MUST pre-select the nearest active agent by distance from the buyer's pin
  and allow choosing any active agent.
- **FR-003**: Checkout MUST show Item, Courier (fixed per item, from Settings), Agent fee (per item,
  from Settings), Tokens, PayHere fee and Total.
- **FR-004**: The PayHere fee MUST be charged only on the part paid through the gateway, as
  `remainder / (1 − rate) − remainder`, rounded to the cent, with the rate in Settings.
- **FR-005**: Tokens MUST apply before the gateway. A fully token-paid order MUST NOT use the
  gateway.
- **FR-006**: Stock MUST be reserved when payment is started and sold only when payment is
  confirmed. An abandoned payment MUST release it.
- **FR-007**: Only a verified gateway notice MUST confirm a payment, once, with the amount and
  currency checked. A browser return MUST NOT confirm it.
- **FR-008**: The first release MUST use a demo gateway that copies the PayHere flow: a hosted page
  with Pay, Fail and Cancel, a signed server notice and a return page. Replacing it with PayHere
  MUST NOT change any other part of the system.
- **FR-009**: Late or duplicate payments MUST become the buyer's tokens. No cash is ever returned
  to buyers.

**Baskets and delivery**

- **FR-010**: Each active agent MUST have at most one open basket per factory. Only paid orders
  join it, and orders are never split.
- **FR-011**: A basket MUST lock automatically when its total reaches the lock amount (LKR 50,000,
  Settings), and a new open basket MUST start.
- **FR-012**: A basket MUST lock and ship when its first order is older than the maximum wait (2
  months, Settings).
- **FR-013**: Factory Packing MUST see locked baskets with the agent's name and area, the saved
  checklist, a required photo, Report a problem, and Packed.
- **FR-014**: Admin MUST enter the courier fee and driver name, phone and vehicle for each packed
  basket. Packing MUST record Given to driver, and Parcel is back after a failed trip.
- **FR-015**: The agent MUST pay the driver, record receipt, and be credited exactly the booked fee
  in tokens.

**Collection and returns**

- **FR-016**: Each order MUST have a 6-digit pickup code shown to the buyer. Typing it MUST show the
  agent the items to hand over.
- **FR-017**: Buyers MUST have 48 hours from receipt to file a return. Uncollected parcels MUST
  stay with the agent with no time limit.
- **FR-018**: A return MUST be decided by the factory's Sales or Owner within 24 hours, then by a
  Factory admin after refusal or timeout.
- **FR-019**: After acceptance, the buyer MUST be told which agent to hand the item to, and has 7
  days to do so. Otherwise the return is cancelled.
- **FR-020**: Tokens on handover MUST be the full item price for a factory fault, or the item price
  minus the courier charge for a buyer fault. Agent fee and PayHere fee MUST NOT be returned.
- **FR-021**: Factory-fault return courier charges and unsuppliable items MUST be deducted from the
  factory's payout.

**Money and tokens**

- **FR-022**: Each item MUST become payable to the factory 48 hours after agent receipt with no open
  return. Payouts MUST total items up to Saturday 11:59 pm (Sri Lanka time) for payment every
  Sunday, recorded by Core admin with a bank reference.
- **FR-023**: Agents MUST earn the agent fee per item received, credited in tokens every Sunday.
- **FR-024**: Any user MUST be able to send tokens to any other user, with no reversal. Admins take
  no action on cash deals outside the platform.
- **FR-025**: Cash MUST be paid only to factories.
- **FR-026**: Core admin MUST see tokens issued by type (late payment, agent fee, courier, return,
  missing item, deposit) and the total outstanding.

**Agents**

- **FR-027**: Applicants MUST submit NIC, own photo, address, pin and storage photos. Approval MUST
  be blocked within 2 km of an active agent. The service radius MUST be 1 km for display.
- **FR-028**: Approved agents MUST pay the deposit (LKR 200,000, Settings) plus the PayHere fee
  before going live. The deposit stays locked while they are active.
- **FR-029**: Admin MUST be able to suspend an agent, and to record a leaving agent's losses with
  photos and a reason. Core admin reviews disputes. The deposit minus losses is returned as tokens.

**Screens**

- **FR-030**: Every role's home MUST show its most important item first, with the approved
  contents. Buyer: Ready to collect, Return to hand over, My orders with basket progress and Share
  basket, Tokens, Shop. Agent: Hand over, Arriving today, Waiting for pickup, Returns to collect,
  Open baskets, Tokens. Factory: Packing, Sales and Owner as approved. Admin: Agents and orders,
  Factory, Core.
- **FR-031**: Factories MUST have three roles only: Owner, Sales and Packing. Planner jobs move to
  Sales.
- **FR-032**: Settings MUST hold the courier charge, agent fee, PayHere fee rate, lock amount,
  maximum wait, 48 hours, 7 days, radius and gap, deposit and commission.

**Removal**

- **FR-033**: Remove buyer-run group baskets, join requests, merging, invites, discovery, bank
  slips and review, packing staff, warehouse, lots and price changes, samples, stock offers, owner
  chat and bank details in Settings. Retire the conflicting policy rules.
- **FR-034**: Premium brands and design likes MUST be hidden and their data kept.
- **FR-035**: Keep sign-in, accounts and pins, products and variants, the factory portal,
  onboarding and agreement, tokens, notifications, quality reports, ratings and fault holds.
- **FR-036**: Existing development data: all existing data is demo data. It MUST be reset and
  re-seeded with demo agents, baskets and orders for every role (owner answer, 2026-11-07).

### Key Entities

- **Agent**: a person with a location, service radius, status (applied, approved, live, suspended,
  left), documents and deposit.
- **Agent basket**: belongs to one agent and one factory; status Open, Locked, Packed, With
  courier, At agent; total, first-order time, lock time.
- **Order**: a buyer's paid items for one factory in one basket; item, courier, agent fee, token
  and PayHere fee amounts; pickup code; received, collected.
- **Payment attempt**: amount, status, gateway reference; at most one success per order.
- **Courier booking**: basket, fee, driver details, given-to-driver and received times.
- **Return**: order line, fault type, decision, handover agent, deadline, tokens credited.
- **Factory payout**: factory, week, earned items, deductions, bank reference.
- **Token entry**: user, signed amount, type, and counterparty for transfers. Entries are never
  changed.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A buyer can go from cart to paid order in under 2 minutes on a phone.
- **SC-002**: A basket reaching the lock amount locks within 1 minute of the payment that pushed it
  over.
- **SC-003**: An agent can hand over a parcel by code in under 30 seconds.
- **SC-004**: 100% of factory payouts match the rule of items received over 48 hours, with no open
  return, minus listed deductions, by Saturday 11:59 pm.
- **SC-005**: No payment is ever confirmed twice, and no item is ever oversold, under repeated or
  simultaneous notices.
- **SC-006**: Every token entry has a type, and the outstanding total matches the sum of balances.
- **SC-007**: Every screen works at 360 px width and by keyboard.

## Assumptions

- The 2-month clock starts at the basket's first paid order.
- Stock is held from starting payment until the gateway session is abandoned, at which point it is
  released.
- Return courier charge equals the per-item courier charge in Settings.
- Sunday credits and payouts use Sri Lanka time.
- The real PayHere switch, and PayHere's written approval of this model, come after this release.
- Rule IDs in the operating brief are rewritten for this model; retired IDs are listed in the
  changelog.
