# Feature Specification: Join requests instead of share links

**Feature Branch**: `feat/006-join-requests`

**Created**: 2026-11-21

**Status**: Approved by the owner (2026-11-21)

**Input**: Owner, 2026-11-21: "lets remove the link sharing part. If a person needs to connect then
it sends a connecting request, then the owner can either accept or decline." Answers: the joiner
pays after being accepted; every open basket of the factory is listed and every join needs the
owner's OK; once accepted they add more freely.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ask to join a basket (Priority: P1)

A buyer ticks items of one factory in the cart, picks Join a basket and sees every open own
basket of that factory (owner's first name, area, items so far). They tap Ask to join on one;
the owner is notified. Nothing is paid and nothing leaves the cart.

**Independent Test**: As a buyer with a Ceylon item ticked, ask to join Kasun's basket; the row
shows Asked; Kasun has a notice; the cart still holds the item.

**Acceptance Scenarios**:

1. **Given** open own baskets of the ticked items' factory, **Then** all of them are listed except
   the buyer's own, each with Ask to join, Asked, Declined or ready to pay.
2. **Given** a buyer asks to join, **Then** the request records the ticked items, and asking again
   for the same basket is refused.
3. **Given** a buyer asks with items of another factory, **Then** the request is refused.

---

### User Story 2 - Owner accepts or declines (Priority: P1)

The owner opens their basket's order page and sees each waiting request: the person's name and
the items they want, with Accept and Decline. The requester is notified of the answer.

**Acceptance Scenarios**:

1. **Given** a waiting request on an open basket, **When** the owner accepts, **Then** the
   requester is told and can pay into the basket.
2. **When** the owner declines, **Then** the requester is told and cannot pay into it or ask again.
3. **Given** the basket is no longer filling, **Then** no requests are shown and none can be
   answered or made.

---

### User Story 3 - Pay after acceptance; add more freely (Priority: P1)

An accepted buyer opens the cart, picks Join a basket, chooses that basket and pays for the ticked
items. Later they can add more the same way without asking again.

**Acceptance Scenarios**:

1. **Given** an accepted request, **Then** the basket can be chosen and paid for.
2. **Given** no accepted request and no paid order in the basket, **Then** paying into it is
   refused, even by a crafted request.

---

### User Story 4 - No share links (Priority: P2)

Share basket, Who can join and the share-link basket page are gone. Anyone opening an old basket
link who is in the basket lands on their order page; anyone else gets not found.

### Edge Cases

- A pending request on a basket that gets placed, cancelled or refunded is no longer shown.
- A buyer already in the basket (paid order) never needs a request.
- The owner of the basket never sees their own basket under Join a basket.

## Requirements _(mandatory)_

- **FR-001**: Join a basket MUST list every open, paid own basket of the ticked items' factory that
  the buyer does not own, with the buyer's request state.
- **FR-002**: Asking to join MUST create one request per buyer and basket with the ticked items
  (one factory, the basket's), notify the owner, and move no money or stock.
- **FR-003**: Only the owner MUST be able to accept or decline, only while the basket is filling;
  the requester MUST be notified either way.
- **FR-004**: Paying into an own basket MUST require being its owner, having a paid order in it,
  or having an accepted request.
- **FR-005**: Share links, Share basket and Who can join MUST be removed; new baskets have no share
  code or visibility.
- **FR-006**: The owner's order page MUST show waiting requests with each person's name, items,
  Accept and Decline; no explanation sentences, no repeated facts, 360 px, 44 px targets.

## Success Criteria _(mandatory)_

- **SC-001**: No one pays into another buyer's basket without the owner's acceptance or an earlier
  paid order there.
- **SC-002**: A declined buyer never pays into that basket.

## Assumptions

- A declined buyer cannot ask the same basket again (Claude's call).
- Requests do not expire; they stop mattering once the basket stops filling.
- Old baskets' visibility and share codes stay in the database, unused.
