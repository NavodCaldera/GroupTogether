# Feature Specification: Family Packs

**Feature Branch**: `feature/family-packs`
**Created**: 2026-11-23
**Status**: Draft
**Sources**: [PRD](../../_bmad-output/planning-artifacts/prds/prd-GroupTogether-2026-11-23/prd.md), [architecture spine](../../_bmad-output/planning-artifacts/architecture/architecture-GroupTogether-2026-11-23/ARCHITECTURE-SPINE.md) (DEC-030)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse to a pack (Priority: P1)
A family finds a pack and sees exactly what it will receive. The path is a category, then a company, then the company's standard packs, then one pack's details.

**Why this priority**: Nothing else works without it.

**Independent Test**: A visitor walks from Personal Care to Hemas to the 30-day pack and sees its items, price per family and group size.

**Acceptance Scenarios**:
1. **Given** published packs exist, **When** a buyer opens the storefront, **Then** only categories that have packs are listed.
2. **Given** a company page, **When** packs are listed, **Then** each one shows the duration, the families per group, the number of items in one family's pack, and the price per family.
3. **Given** a pack page, **When** it is viewed, **Then** it lists item, size and quantity for ONE family, and offers no way to change them.

### User Story 2 - Join or start a nearby group (Priority: P1)
A signed-in buyer with a map-pinned address sees open groups for that exact pack within 1 km. They pay to join one, or pay to start one and become its basket owner.

**Why this priority**: This is how the model makes money.

**Independent Test**: A buyer within 1 km of a 7/10 group pays, and the group shows 8/10. A buyer with no group nearby starts one, and others can see it only after the starter's payment succeeds.

**Acceptance Scenarios**:
1. **Given** an open group 600 m away for the same pack version, **When** the buyer views the pack, **Then** they see the distance, area, "7 of 10 families", spots left and the closing date. They see no names, phone numbers or addresses.
2. **Given** the buyer pays successfully, **Then** their spot is confirmed and the group count goes up by one.
3. **Given** the buyer starts a group, **When** their payment fails or times out, **Then** the group is never shown to anyone.
4. **Given** two buyers try for the last spot at the same time, **Then** exactly one holds it and the other is told the group is full before paying.
5. **Given** a buyer already holds a spot, **When** they try again, **Then** they are refused.
6. **Given** the buyer has no pinned address, **Then** they are asked to set one first.

### User Story 3 - Group fills or times out (Priority: P2)
A full group is delivered to its owner. A group that doesn't fill extends twice, then refunds everyone.

**Independent Test**: Run the daily sweep on a group past its closing date three times. The first two runs extend it, and the third closes it and refunds each member once as tokens.

**Acceptance Scenarios**:
1. **Given** the last spot is paid, **Then** the group becomes full, stops accepting joins, and creates a delivery order for the company to the owner's address.
2. **Given** a full group, **Then** members see the owner's first name, phone and address, and the owner sees the members' first names and phones.
3. **Given** the owner marks the delivery received, **Then** the company becomes due the price minus commission for each family on the next weekly payout.
4. **Given** a group is still open after 2 extensions, **When** its closing date passes, **Then** it closes and each paid member is refunded the full price as tokens exactly once.

### Edge Cases
- A held spot whose payment never completes is released after 15 minutes.
- A pack is changed after groups exist: those groups keep their original items, price and size.
- The owner edits their address after starting: the group keeps the original location.
- The sweep runs twice: no member is refunded twice.
- A paid member asks to leave: refused, because payment is final.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The system MUST list only categories and companies with active published packs, and mark demo companies.
- **FR-002**: Pack listings MUST tell "families per group" apart from "items in your family pack".
- **FR-003**: A pack's published contents, price, group size (5–15) and commission MUST NOT change. A change creates a new version, and existing groups keep theirs.
- **FR-004**: Nearby groups MUST be limited to the same pack version, OPEN status, and an owner location within 1 km.
- **FR-005**: A join MUST hold one spot while payment is pending, confirm it when payment is verified, and release it after 15 minutes otherwise.
- **FR-006**: The system MUST never let a group hold more spots than its group size, even under simultaneous requests.
- **FR-007**: One buyer MUST hold at most one spot per group. Paid spots MUST NOT be cancelled by the buyer.
- **FR-008**: A started group MUST stay hidden until the owner's payment is verified.
- **FR-009**: An unfilled group MUST extend by its duration at most twice. It then MUST close and refund each paid member once, as tokens.
- **FR-010**: A full group MUST create one delivery for N packs to the owner's saved address.
- **FR-011**: Contact details MUST be shown only to members of a full group.
- **FR-012**: The commission per family MUST be the pack's percentage of the price, rounded to the cent. The company payout MUST be (price − commission) × families, released after the owner confirms receipt.
- **FR-013**: Members MUST be notified when a group extends, fills and is refunded.

### Key Entities
- **Company**: the maker publishing packs in one category, linked to its seller account. It can be marked demo.
- **Standard pack**: a company's named pack with a duration in days.
- **Pack version**: the fixed items, price per family, group size, household size and commission percentage.
- **Group**: one pack version, an owner and a location snapshot. Its status is pending, open, full or closed, and it has a closing date and an extension count.
- **Member**: a buyer's spot in a group, either held or paid, with its payment.
- **Delivery**: a full group's single shipment to the owner, which is ordered, then dispatched, then received.

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: A first-time buyer gets from the storefront to a paid spot in under 3 minutes.
- **SC-002**: Zero groups are ever overfilled, shown by a test of simultaneous joins on the last spot.
- **SC-003**: 60% of groups fill within 2 extensions in the first 90 days.
- **SC-004**: Refunds are 100% exactly-once: no member is refunded twice or missed.
- **SC-005**: No contact details are visible to non-members, checked by access tests.

## Assumptions
- Payment uses the existing gateway, and refunds are paid as tokens, not to the card.
- Location comes from the address pin saved at sign-up.
- Admin screens for companies and packs come later. The seed provides the data.
- The basket owner gets no reward, and the agents are not used (the system is not published yet).
- Redelivery cost when the owner can't be reached is out of scope (PRD open question).
