---
title: GroupBasket Family Packs PRD
status: final
created: 2026-11-23
updated: 2026-11-23
decision: DEC-030
---

# GroupBasket Family Packs

## 1. Summary
GroupBasket sells fixed **standard family packs** straight from Sri Lankan companies (for example Hemas, CBL, Maliban and Pelwatte; demo names, not partnerships).
- Neighbouring families join a **group** for one exact pack.
- Each family **pays when it joins**.
- When the group fills, the company delivers the whole bundle to the **basket owner**, the first family that paid, who hands the packs to the other families.
- There are no area agents and no middleman.
- GroupBasket earns a **percentage commission set on each standard pack**.

This replaces item-by-item shopping as the main storefront. Old orders, payments and tokens stay.

## 2. Problem and goal
Families in Sri Lanka pay retail mark-ups on everyday goods such as soap, biscuits and milk powder. Companies would sell cheaper in bulk, but one family can't buy bulk.

**Goal:** a family buys a predictable 15- or 30-day supply at a bulk price, grouped with nearby families, with no picking, no haggling and no shop in between.

## 3. Users
| User | Need |
|---|---|
| **Buyer family** | A pack at a known price, collected close to home |
| **Basket owner** | The first payer in a group. Receives the bundle at their address and hands out the packs |
| **Company** | Publishes standard packs and delivers full bundles; paid weekly |
| **GroupBasket admin** | Approves companies and packs, sets commission, handles refunds and disputes |

## 4. User journeys
**UJ-1. Nimali joins a nearby group.**
1. Nimali, a mother of three in Dehiwala, opens Personal Care, then Hemas, then the **30-day Family Pack**.
2. She sees exactly what her family gets (8 soaps, 2 toothpastes, shampoo and hair oil), the price per family and "Group of 10 families".
3. Under **Groups near you** she sees a group 600 m away at 7 of 10, closing on 30 Nov.
4. She pays and takes spot 8. My groups now shows 8 of 10 and the owner's area, but not the owner's address until the group is full.

**UJ-2. Kasun starts a group.**
1. Kasun finds no group near him, so he taps **Start a group**.
2. He pays and becomes the **basket owner**. The group is set to deliver to his saved address.
3. Neighbours who open the same pack see his group under **Groups near you**.

**UJ-3. The group fills.**
1. The 10th family pays, and the group becomes FULL and stops taking joins.
2. The company gets one order for 10 identical packs to the owner's address.
3. Members see the owner's first name, pickup area and phone once the group is full, so they can arrange collection.
4. The owner marks each family as collected.

**UJ-4. The group doesn't fill.**
1. When the closing date passes, the group extends by one more period, up to 2 times.
2. If it is still not full after that, it closes and every member is refunded the full amount as tokens.

## 5. Features and functional requirements

### F1. Browse
- **FR-1.** The home page for buyers lists categories that have at least one active published pack.
- **FR-2.** A category lists its companies. Demo companies carry a "Demo" badge.
- **FR-3.** A company lists its standard packs with name, duration in days, families per group, number of items in each family's pack, and price per family. The wording must keep "10 family packs per group" apart from "N items in your family pack".
- **FR-4.** The pack page shows what one family gets: item name, size and quantity, the price per family, the household size if one is set, and the group size.
- **FR-5.** A buyer cannot add, remove or swap items.

### F2. Standard packs and versions
- **FR-6.** A standard pack has an identity: company, name and duration. It also has published **versions** holding the items, price per family, group size (5–15), household size and commission percentage.
- **FR-7.** A published version is never edited. A change publishes a new version, and existing groups keep the version they started on.
- **FR-8.** Only admin-approved companies can publish packs, and the admin approves each new version.

### F3. Nearby groups
- **FR-9.** A buyer must have a saved address with a map pin; the sign-up pin already exists. Without one they are asked to set it before they can see or start groups.
- **FR-10.** Groups near you lists OPEN groups for the **same pack version** whose owner's address is within **1 km** of the buyer. Each group shows distance, area name, "7 of 10 families", spots left and the closing date.
- **FR-11.** Before a group is full, no member names, phone numbers or exact addresses are shown, including the owner's.

### F4. Join and start
- **FR-12.** Joining takes one spot and charges the price per family. The spot is confirmed only when the payment is verified; until then it is held for **[ASSUMPTION] 15 minutes**.
- **FR-13.** Starting a group creates it as PENDING with the starter as basket owner. The group becomes OPEN and visible to others only when the owner's payment is verified, and it delivers to the owner's saved address. If the owner's payment fails, the group is never opened.
- **FR-14.** One buyer has at most one spot per group. Duplicate, closed, expired or over-capacity joins are refused on the server.
- **FR-15.** Taking the last spot is a single transaction under a row lock, so two buyers can never fill one spot. The group then becomes FULL.
- **FR-16.** Payment is final: members cannot leave once they have paid.

### F5. Closing, extending and refunds
- **FR-17.** Each group has a closing date, set by default to the pack's duration from creation **[ASSUMPTION]**.
- **FR-18.** An OPEN group whose closing date passes is extended by one period, at most **2 times**. After the second extension, an unfilled group CLOSES and each member is refunded the full price as tokens through the append-only ledger.
- **FR-19.** Members are notified on each extension, when the group is full and when it is refunded.

### F6. Fulfilment to the basket owner
- **FR-20.** A FULL group creates one factory order of N identical packs, delivered to the basket owner's address.
- **FR-21.** The company marks the order packed and dispatched, and the owner marks it received.
- **FR-22.** Once the group is full, members see the owner's first name, area and phone, and the owner sees the members' first names and phones.
- **FR-23.** The owner marks each family as collected. A member can report "not received" within **[ASSUMPTION] 3 days**, and the report goes to admin.

### F7. Money
- **FR-24.** Commission is the pack version's percentage of the price, for example 10% of LKR 150 is LKR 15. The company is paid price minus commission per family pack, on the weekly payout, after the owner marks the order received.
- **FR-25.** All money uses Decimal(14,2), and payments use the existing gateway and verified-notice flow.
- **FR-26.** If a company fails to deliver, the admin refunds every member as tokens.

### F8. Admin
- **FR-27.** The admin approves companies, packs and versions, and sets the commission percentage.
- **FR-28.** The admin can see every group with its status, members and payments, and can close a group with refunds.

## 6. Non-functional requirements
- **NFR-1. Concurrency:** no group is ever overfilled, which integration tests with parallel joins must prove.
- **NFR-2. Privacy:** member contact details are hidden until a group is full and are visible only to members of that group.
- **NFR-3. Ledger:** refunds and payouts are append-only token or ledger entries and are never edited.
- **NFR-4. Mobile:** every buyer screen works at 360 px width.
- **NFR-5. Language:** English first. **[ASSUMPTION]** Sinhala and Tamil come later.

## 7. Success metrics
| Metric | Target for the first 90 days |
|---|---|
| Groups that fill | ≥ 60% within 2 extensions |
| Median time to fill | ≤ 10 days |
| Repeat families (second pack) | ≥ 40% |
| Saving against retail | ≥ 15% per pack |

**Counter-metrics:**
- refunds from unfilled groups (keep under 25%);
- "not received" reports (under 2% of families);
- basket owners who stop owning after their first group.

## 8. Compliance and risks
- **Food packs** (dairy, biscuits) need the company's food registration and an expiry later than the delivery date plus the pack's duration.
- **Owner as distributor:** a basket owner handles other people's goods with no reward (by owner decision). Risks are theft, disputes and owner drop-off.
- **Held money:** payment on join means GroupBasket holds money for up to 3 periods. This needs a gateway and legal check.
- **Brand names** must not suggest partnerships that don't exist.

## 9. Out of scope for this release
- Item-by-item shopping in the new storefront (the old /shop route stays but is not linked).
- Area agents and pickup points.
- Taking more than one spot.
- Subscriptions that repeat every 15 or 30 days.

## 10. Open questions
1. If the owner's address is wrong or they can't be reached at delivery, who pays for redelivery?
2. Does the company set the closing period, or GroupBasket?

## 11. Decided (2026-11-23)
- Payment happens on join, and a paid spot is final.
- A group extends twice, then closes and refunds as tokens.
- There are no agents. The bundle goes to the basket owner, the first payer, who must pay successfully before the group opens. The owner gets no reward.
- Nearby means within 1 km.
- Commission is a percentage per pack version.
- The system is not published yet, so there is no agent data to migrate.
