---
name: groupbasket
description: Lead agent for GroupBasket. The family-pack business model, its rules and where they live in code. Read first for any planning or change.
---

# GroupBasket operating brief

GroupBasket is group buying of **family packs** from companies people already know (`DEC-030`,
2026-11-23). Families near each other fill a basket together and one order goes to the company.
The system is not public yet. Earlier models (clothing, agents, group deals) are saved at the
`archive/any-product-pivot` branch and the `any-product-pivot-2026-11-23` tag.

## Words

- **Category:** a shelf on the home page, such as Personal Care or Dairy.
- **Company:** a maker listed under one category, shown by its brand logo (`logo`). `demo: true` marks a sample listing, never a real partnership; it is not shown on screen.
- **Standard pack:** one company's fixed pack for one family of 4. Every company has exactly two, **Budget** and **Premium**, both 30 days. It has versions.
- **Pack version:** fixed items, full price per family, a discount % for baskets of 5, 10 and 15 families, household size and commission %. It is never edited once published; a change is a new version.
- **Basket** (`PackGroup` in code): one pack version bought together by families within 1 km of each other. Its size (5, 10 or 15 families) is chosen by the family that starts it, and its price per family (the full price less that size's discount) is fixed then; neither ever changes.
- **Company login:** a user with `companyId` manages that company at `/company`: banner, logo, a photo of each pack's items, new pack versions (items, price and the three discounts; household and commission are kept) and its orders. Only the site owner gives a login a company (`npm run company:login`).
- **Owner:** the family that started the basket and paid first. The order is delivered to them.
- **Tokens:** GroupBasket credit. Every refund is paid in tokens, never cash.

## Rules

| ID   | Rule                                                                                                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PK-1 | Home lists categories, each with its companies. A company page lists its packs, then its open baskets near you.                                                                                                      |
| PK-2 | A buyer must have an address pin. Baskets are found within **1 km** of it, the buyer's contacts' baskets first, then nearest.                                                                                        |
| PK-3 | Starting a basket means choosing 5, 10 or 15 families and paying for your spot at that size's price. It stays hidden (`PENDING`) until that payment succeeds, then opens. A failed first payment deletes the basket. |
| PK-4 | Joining means paying. An unpaid spot is held for `paymentHoldMinutes` (15) and counts toward the total, so a basket is never overfilled. One spot per family; payment is final and nobody leaves.                    |
| PK-5 | When every spot is paid, the basket is **full**: one order (`PackDelivery`) goes to the company, delivered to the owner. The company is owed `(price − commission) × families`.                                      |
| PK-6 | A basket that has not filled by its closing date is extended by the pack's duration, **twice** at most. Then it closes and every paid family gets its price back as tokens.                                          |
| PK-7 | A payment that arrives after its spot was released, or for the wrong amount, comes back as tokens, once per payment.                                                                                                 |
| PK-8 | The owner gets no reward. There are no agents.                                                                                                                                                                       |
| PK-9 | The token ledger is append-only: the database refuses updates and deletes.                                                                                                                                           |

## Not decided yet

See [decisions](../../docs/decisions.md): showing contacts once a basket is full, the owner's
Received step, the company's Dispatched step, paying companies, notifications, spending
tokens and the mobile app.
