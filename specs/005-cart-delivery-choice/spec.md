# Feature Specification: Cart delivery choice and factory baskets

**Feature Branch**: `feat/005-cart-delivery-choice`

**Created**: 2026-11-21

**Status**: Approved by the owner (2026-11-21)

**Input**: Owner, 2026-11-21: "improve this cart page. It contains our 3 ways, Agent pickup, My
basket, Join a basket. Buyer has to select one. First has to select the item and then the
delivery option. Cart may have many different items and buyer can select one by one or select all
together and put the selected ones into one delivery option and the rest in another … when the
buyer selects pickup agents it shows the nearest agents; if own basket it shows the currently
created baskets, put it in or create a new one; if join basket it shows the baskets for it."
Then: "lets remove these limitings. A basket can hold only items from that particular factory, no
other factory items (they can have different items from that factory)." Approved the layout:
"yes".

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Send selected items by agent pickup (Priority: P1)

A buyer ticks some cart items (or Select all), picks Agent pickup, chooses one of the nearest
agents and pays for just those items. The rest stay in the cart.

**Why this priority**: Agent pickup is the main way buyers order; it must work on a part of the
cart.

**Independent Test**: With three items in the cart, tick two, choose Agent pickup and pay; two
orders' worth of items are bought and the third item remains in the cart.

**Acceptance Scenarios**:

1. **Given** items from two factories are ticked, **When** the buyer pays by agent pickup,
   **Then** one order per factory is placed at that agent and only the ticked items leave the cart.
2. **Given** nothing is ticked, **Then** the three choices cannot be used.

---

### User Story 2 - Put selected items into my own basket (Priority: P1)

A buyer ticks items from one factory, picks My basket and either adds them to one of their own
open baskets for that factory or starts a new one (address, area, phone, who can join), then pays.

**Why this priority**: Own baskets are the second way to buy; they now hold any items of one
factory.

**Independent Test**: Tick a shirt and chinos from the same factory, start a new basket, pay; the
basket holds both products. Tick another product of that factory later and add it to the same
basket.

**Acceptance Scenarios**:

1. **Given** ticked items all come from one factory, **Then** My basket lists the buyer's open
   own baskets for that factory and a New basket option.
2. **Given** ticked items come from more than one factory, **Then** My basket and Join a basket
   are unavailable.
3. **Given** the buyer adds to an existing basket, **Then** the basket's item count includes the
   new pieces of every product.

---

### User Story 3 - Join someone's basket from the cart (Priority: P1)

A buyer ticks items from one factory, picks Join a basket, chooses one of the open public baskets
of that factory and pays.

**Why this priority**: Joining fills baskets; it now matches by factory, not by product.

**Independent Test**: Another buyer's public basket for a factory is listed when the ticked items
come from that factory, and joining puts the ticked items into it.

**Acceptance Scenarios**:

1. **Given** ticked items from factory F, **Then** Join a basket lists open public baskets of F
   (area, owner first name, items so far), not the buyer's own.
2. **Given** no such basket exists, **Then** the choice shows none to join.

---

### User Story 4 - Basket pages show the factory and its products (Priority: P2)

Own basket pages, order pages and notifications name the factory and list each buyer's products
and sizes, since a basket can hold several products.

**Independent Test**: An own basket with two products shows both on the order page's Buyers card
and on the basket page.

**Acceptance Scenarios**:

1. **Given** a basket holding two products, **Then** the basket page is titled with the factory
   name and the join form offers sizes of the products already in the basket.
2. **Given** a notification about that basket, **Then** it names the factory.

### Edge Cases

- A ticked item is out of stock or no longer available: payment is refused with the item named;
  nothing is bought.
- The cart changes in another tab between ticking and paying: only items still in the cart are
  bought.
- Older own baskets that held one product keep working and now accept the factory's other
  products.
- A share link to a link-only basket still lets a buyer join from the basket page.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The cart MUST let the buyer tick items one by one or all at once, grouped by factory.
- **FR-002**: The cart MUST offer exactly three choices for the ticked items: Agent pickup, My
  basket, Join a basket; one choice at a time.
- **FR-003**: Agent pickup MUST list the nearest live agents (nearest first, open now or closed)
  and buy only the ticked items, one order per factory, leaving the other items in the cart.
- **FR-004**: My basket and Join a basket MUST be available only when every ticked item comes
  from one factory.
- **FR-005**: My basket MUST list the buyer's own open baskets for that factory and a New basket
  option (address, town or area, phone, who can join), and buy only the ticked items into it.
- **FR-006**: Join a basket MUST list open public baskets of that factory that the buyer does not
  own, and buy only the ticked items into the chosen one.
- **FR-007**: An own basket MUST accept any live products of its factory and refuse items of any
  other factory.
- **FR-008**: There MUST be no limit on how many pieces of one item a buyer takes, beyond stock.
- **FR-009**: Each payment covers one choice; paid items leave the cart.
- **FR-010**: Own-basket pages, order pages and notifications MUST name the factory and show each
  buyer's products with sizes.
- **FR-011**: The page MUST work at 360 px with 44 px targets, show no explanation sentences and
  not repeat a fact.

### Key Entities

- **Cart item**: a product size and quantity the buyer intends to buy; belongs to one factory.
- **Own basket**: a basket of one factory, owned by a buyer, delivered to them; holds any of that
  factory's products from any buyer in it.

## Success Criteria _(mandatory)_

- **SC-001**: A buyer can send part of the cart by one way and the rest by another without
  leaving the cart page except to pay.
- **SC-002**: No own basket ever contains items of two factories.
- **SC-003**: Every ticked item is bought exactly once; unticked items are never bought.

## Assumptions

- One payment per choice, as checkout already works (Claude's call).
- The minimum to place an own basket stays 10 pieces, counted across all its products.
- Products added to an existing basket keep their own prices; the factory is the only shared
  property.
- The own-basket start page (`/own-baskets/new`) is replaced by the cart and sends visitors to the
  cart.
