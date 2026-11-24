# Changelog

Newest first. The history of the earlier models (clothing, agents, any-product deals) is in this
file at the `any-product-pivot-2026-11-23` tag.

## 2026-11-24: Reselling as one list

The owner asked for one Reselling list instead of the From Contacts and Nearby tabs, and for Purchase history on the profile.

- `/reselling` shows contacts' listings first, then nearby ones (within 1 km), each nearest first, with the distance and a "Contact" badge. Without an address pin, only contacts' listings show. The seller's My contacts / Nearby / Both choice is unchanged.
- The Purchase history button moved from Reselling to the Profile page (buyers only).

## 2026-11-24: Company name on open baskets

The owner asked for the company name on each basket in Open baskets (`/baskets`), e.g. "CBL Group · Budget Pack". Company and pack pages already name the company, so their cards are unchanged.

## 2026-11-24: At-cost resale (DEC-031)

The owner asked for at-cost resale of unwanted, unopened items. Buying a whole pack is unchanged.

- **Purchase history** (`/purchases`) lists the buyer's paid spots. A basket's page shows the items as bought (its pack version), what each unit cost and how many are left to resell.
- **Price:** the basket price is split across its items by shop value (shop price × quantity) in whole cents, so the items add up to the price (`itemCosts` in `src/lib/pack-money.ts`). A unit's price is its line over its quantity. When an item has no shop price, the page says "Original item price unavailable" and it cannot be resold. Today's prices are never used.
- **Listing:** only from the buyer's own paid spot in a full (ordered) basket, never chilled or frozen items (a new per-item "Storage" choice in the company dashboard), never more units than bought. The seller confirms the items are unopened, names a public pickup spot and picks My contacts, Nearby buyers or Both.
- **Reselling tab** (`/reselling`): From Contacts (both buyers saved each other's number) and Nearby (within 1 km of the basket's delivery point). Viewers see the area only. The pickup spot is shown only to the seller and to a buyer holding a reservation. Visibility is checked on the server, also for direct links.
- **Reservations:** held for 48 hours. The buyer pays the seller at pickup. The seller marks it collected; either side cancels. A lapsed reservation stops holding units at once, and the daily sweep marks it expired. Both listing and reserving lock rows, so units are never oversold.
- **My listings** (`/reselling/mine`): the seller's listings with available, reserved and collected units, and the buyer's reservations.
- **Contacts:** buyers save contacts' mobile numbers on their profile. Numbers are never shown to anyone else.
- Migration `20261124130000_resale` adds `PackItem.chilled`, `ResaleListing` and `ResaleReservation`. The seed adds an ordered CBL basket and two of Sachini's listings.

## 2026-11-24: No categories, 26 companies

The owner asked for these changes:

- **No categories:** the `Category` table and `Company.categoryId` are gone (migration `20261124120000_drop_categories`). The home page shows every company in one grid, and the Baskets filter has only Company.
- **Companies:** the seed lists 26 sample companies in the owner's order: CBL Group, Maliban Group, Hemas Consumer Brands, Renuka Foods, Sunshine Consumer Lanka, Harischandra Mills, Wijaya Products, Kingdom of Raigam, Lanka Canneries, Edinborough Products, C.W. Mackie, Swadeshi Industrial Works, Multichemi International, Pelwatte Dairy Industries, Lanka Milk Foods, Milco, Ceylon Cold Stores, CIC Holdings, Ruhunu Foods, Marina Foods, Uswatte Confectionery Works, Finagle Lanka, Pussalla Meat Producers, Bairaha Farms, Nature’s Beauty Creations and Antler Industries. Cargills and Keells Food Products were left out. They are potential suppliers, not partners (`demo: true`). Pack contents and prices are samples. Only CBL, Maliban, Hemas and Pelwatte have logos; the rest show their name.

## 2026-11-23: Company logins see only their dashboard

A company login signs in to `/company`. Its header has no Home, Baskets or Tokens tabs, and the
logo leads to the dashboard. Opening `/`, `/baskets` or `/tokens` sends it to the dashboard
(`redirectCompany` in `src/server/auth/session.ts`).

## 2026-11-23: "Family of 4 members"

The household badge on pack cards and pages now reads "Family of 4 members".

## 2026-11-23: Item photos and shop prices

The owner asked for these changes:

- **Items:** every item in a pack can have a photo and a shop price for one unit (`PackItem.photo`, `PackItem.retailPrice`, migration `20261123150000_item_photos`). The pack and basket pages show each item's photo, size, "LKR x each in shops" and quantity.
- **Dashboard:** each item row has its name, size, quantity, shop price and a photo upload (1 MB at most). Publishing makes a new version. An item keeps its photo unless a new one is chosen, and a kept photo must be one of the company's own uploads. The server action body limit is now 16 MB.

## 2026-11-23: Basket sizes with discounts

The owner asked for these changes:

- **Basket sizes:** the family starting a basket picks 5, 10 or 15 families. Each size has a discount % that the company sets in its dashboard for each pack version. The basket stores its `size` and its `price` per family (the full price less that size's discount), fixed when it starts. Everyone pays that price, the basket fills at that size, and the company is owed `(basket price − commission) × families`. `PackVersion.groupSize` is gone (migration `20261123140000_basket_sizes`).
- **Pack cards and pack page:** the full price, without "per family", then a table of 5, 10 and 15 families with the discount and price for each. The "family packs per basket" and "items in each family pack" lines are gone. Starting a basket offers one button per size.
- **Company page:** "N family packs bought today", counting spots paid since midnight in Colombo (`PackMember.paidAt`).
- **Home:** the heading box is back to the earlier plain style (grey box, centred, the second sentence in green), with no images or chips.

## 2026-11-23: Company page and dashboard

The owner asked for these changes:

- **Company page:** styled like LinkedIn. A banner, the round logo over its lower left, the name and category, then "N family packs bought", which counts paid spots in baskets that were not refunded.
- **Pack cards:** each card shows a photo of all the pack's items, or a placeholder until one is uploaded.
- **Pack page:** the photo, then the items and quantities for one family, then the baskets.
- **Company dashboard** (`/company`, shown as a Company tab for company logins): upload a banner, logo and pack photos (PNG, JPEG or WebP, 3 MB at most, checked by content). Uploads are stored in the new `Image` table, served by `/img/<id>`, and a replaced image is deleted. A company can edit items and price, which publishes a new version; baskets already started keep theirs. It can also see its orders.
- **Logins:** only the site owner links a login to a company, with `npm run company:login -- <email> <slug>`. The demo login `hemas@example.com` manages Hemas.
- **Home:** a larger hero for "Direct factory to consumer. No more middle man." The pack count under each logo is gone.
- **Database:** migration `20261123130000_company_dashboard` adds `User.companyId`, `Company.banner`, `StandardPack.photo` and `Image`.

## 2026-11-23: Brand logos, Budget and Premium packs

The owner asked for these changes:

- **Home:** the heading is "Direct factory to consumer. No more middle man." The words "Family packs" are gone from the home page and the footer.
- **Brand logos:** companies show their logo instead of their name. The logos come from each company's own website and are stored in `public/logos/`, with a new `Company.logo` field (migration `20261123120000_company_logo`).
- **Demo badge:** no longer shown. The `demo` field stays as an internal marker.
- **Packs:** every company has exactly two standard packs, Budget and Premium. Both run for 30 days and are made for a family of 4, shown as "Family of 4". The 15-day packs are gone. Slugs are `<company>-budget` and `<company>-premium`.
- **Back links:** added to the company, pack and basket pages.

## 2026-11-23: Basket filter follows the category

On Open baskets, the Company list shows only the companies in the chosen category, and a company
outside the new category is cleared (`BasketFilter` in `src/components/client.tsx`).

## 2026-11-23: Minimal core (cleanup)

The owner asked for the smallest system that runs the family-pack model, file by file, with no
unused code.

- **Removed the old models:** agents, carts, orders, checkout, factories, brands and gifts, 3D fit and body mesh, the material library, group deals, returns, quality, payouts, notifications, private file storage, and the admin and seller areas, along with their pages, server code, tests, tools, `fit-lab`, 3D assets, material seeds and specialist agent files.
- **Database:** 16 tables instead of over 90, in one fresh migration (the system was never published). `User` has no role, lock or old profile fields. `Category` is flat. The token ledger keeps two kinds, `PACK_REFUND` and `LATE_PAYMENT`, and its append-only trigger.
- **Code:** sign-in and sign-up are down to name, email, mobile, address pin and password, with no gender or date of birth. The tokens page shows the balance and refund history, without transfers. The header has Home, Baskets and Tokens. Payment notices handle basket spots only, and the daily job runs only the basket sweep. Unused exports, components and helpers are gone.
- **Dependencies:** removed three.js, MediaPipe, OpenCV and fast-check.
- **Docs:** this changelog restarted. The brief, decisions, architecture, README, AGENTS.md and CLAUDE.md now describe only DEC-030. Implementation status merged into architecture, and the four specialist agent files merged into AGENTS.md.
- **Tests:** new or rewritten integration tests for payments, tokens, seed and sign-in lockout; a browser journey for a buyer joining a basket and paying; and accessibility checks for every page.

## 2026-11-23: Family packs (DEC-030, PR #52)

- Home lists categories with their companies. Each company page shows its standard packs and open baskets within 1 km, contacts first. Pack and basket pages added.
- Paying to start opens a basket, and paying to join takes a spot. A full basket places the order with the company.
- The daily sweep frees unpaid spots, extends a basket twice, then closes it with token refunds.
- The Open baskets tab filters by company or category.
