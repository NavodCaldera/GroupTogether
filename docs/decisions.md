# Decisions

Decisions that shape GroupBasket today. Earlier decisions (`DEC-001` to `DEC-029`) belong to the
old models and are kept with them at the `any-product-pivot-2026-11-23` tag.

## DEC-031: At-cost resale (2026-11-24)

Buyers may resell unopened, shelf-stable units from their own paid spot in a full basket, at what
they paid for the unit within the basket, never more. The rules are PK-10 to PK-13 in the
[operating brief](../.claude/agents/groupbasket.md). The owner chose:

- **Pickup:** the seller names a public meeting place. Viewers see the area; only a buyer holding a reservation sees the place. There are no staffed pickup points.
- **Contacts:** a listing reaches a contact only when both buyers saved each other's mobile number. No invite flow; no phone number is shown.
- **One list** (2026-11-24): Reselling shows contacts' listings first, then nearby ones within 1 km, each nearest first. Purchase history is on the profile.

Payment happens at pickup, outside GroupBasket. There is no resale delivery, bidding or payout.

## DEC-030: Family packs (2026-11-23)

The owner replaced the whole business model. The rules are PK-1 to PK-9 in the
[operating brief](../.claude/agents/groupbasket.md). The owner's answers:

- **Payment:** on joining. The owner's own payment must succeed before the basket opens.
- **Unfilled baskets:** auto-extended twice, then closed with token refunds.
- **Leaving:** not allowed; payment is final.
- **Spots:** one per family.
- **Delivery:** to the basket owner, the first family to pay. There are no agents.
- **Commission:** a percentage per pack version, such as 10% of a LKR 150 family pack.
- **Owner reward:** none.
- **Distance:** 1 km from the buyer's address pin; contacts' baskets first, then nearest.
- **Platforms:** a website and a mobile app. The Next.js app is the website and the backend; an Expo app will use `/api/v1`.

The plan documents live in [specs/007-family-packs](../specs/007-family-packs/spec.md) and
`_bmad-output/planning-artifacts/`.

## Open

| Question | Notes |
| --- | --- |
| What families see once a basket is full | The owner's and members' first names and phones were proposed. |
| How the owner confirms delivery | A Received button on the basket page was proposed. |
| How a company dispatches its orders | The dashboard lists orders (2026-11-23); there is no Dispatched step yet. |
| How and when companies are paid | Payout timing and method. |
| Notifications | When a basket fills, extends or closes. |
| Spending tokens | Tokens can't be spent yet. |
| Mobile app | Expo through `/api/v1`, to be recorded as DEC-032. |
