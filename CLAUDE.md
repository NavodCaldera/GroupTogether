# GroupBasket

Group buying for **factory-surplus and B-grade shoes and apparel** in Sri Lanka. We buy stock in
bulk; every order must reach a minimum value, so shoppers fill **shared carts** together. Every
amount is in LKR.

This is a standalone project. It shares no code, database or rules with any other site.

**The site is called GroupBasket** (product owner, 2026-10-19; it was GroupTogether). Everything
users see says GroupBasket, and the admin is `admin@groupbasket.lk`. The folder, repo, npm package,
database names (`grouptogether`, `grouptogether_test`) and the `grouptogether` agent keep the old
name.

**Priorities: speed and low running cost.** Pages are server-rendered and use system fonts.
Client JavaScript is limited to small islands: forms, the countdown and copy-link. Don't add
heavy libraries, paid services or anything that needs an always-on worker.

## Business rules (product owner, 2026-10-16)

1. **Minimum order value is LKR 50,000 per cart**, counted over every member's lines. An admin
   can change it in Settings. Each cart snapshots the minimum when it starts.
2. **Stock is locked when an item goes into a cart** (`Variant.available` goes down and
   `reserved` goes up, checked atomically). Removing the item, leaving the cart, expiry and
   cancellation release it. Confirmation turns it into `sold`. Stock is never oversold.
3. **Carts expire 24h after creation** unless the owner has accepted. Expiry releases stock and
   keeps the lines as history.
4. **When the minimum is reached** (OPEN → READY), every member is notified **in the app**
   (there is no email sending). If the total drops below the minimum, the cart goes back to OPEN.
5. **Only the owner pays, for the whole cart.** The owner presses "Accept & pay" (READY →
   AWAITING_SLIP), which freezes the cart. The owner then has **2 hours** to upload **one bank
   slip**. If they don't, the cart is CANCELLED and its stock released. Members pay their share
   to the owner outside the platform.
6. An admin reviews the slip (SLIP_REVIEW):
   - Approve → CONFIRMED.
   - Reject with a reason → back to AWAITING_SLIP with a fresh 2h window.
   - The owner can't cancel once the slip is in review.
7. **No refunds exist in the system.** Stock is locked from the moment it is added, so a cart
   that is paid for is always in stock.
8. **Delivery is one PickMe drop to the cart owner.** The owner pays the driver directly. The
   platform never charges, collects or refunds a delivery fee; `Delivery.paidBy` is always
   OWNER. Once the drop is on its way (DISPATCHED, not failed), the **owner can mark it
   delivered from their dashboard** (asks once more; other members are notified), the same as
   the admin's "Delivered" on Admin → Orders (product owner, 2026-10-18; `markReceived` in
   `src/server/delivery/index.ts`). A failed drop can be booked again from Orders (2026-10-21):
   the same delivery goes back to BOOKED and the packers hand it over again.
9. **Visibility.** A cart is PUBLIC (shown on the "open carts" panel) or PRIVATE (reached only by
   link). Every cart has a share link `/c/<code>`. The invite-by-email/phone form and the share
   icon (copy link / WhatsApp) were removed from the cart page (product owner, 2026-10-17); the
   buyer dashboard's "Copy cart link" button (while the cart is filling) is the way to share; it
   replaced "Share on WhatsApp" (product owner, 2026-10-17).
10. **No stock type and no defects shown** (product owner: defects removed 2026-10-17; the
    "Stock type" box (Factory surplus / B-grade) removed from the admin product form and the Type
    column from the products list, 2026-10-20). `Product.stockType` stays in the schema: existing
    products keep theirs, new ones are stored as FACTORY_SURPLUS. `Product.defectNotes` stays,
    unused, so old notes aren't lost.
11. **Roles: buyer, factory seller, admin** (product owner, 2026-10-16), **and packing staff**
    (`PACKER`, 2026-10-18, rule 17).
    - **Buyers** (`CUSTOMER`) sign up themselves and land on `/dashboard`.
    - **Factory sellers** (`SELLER`) are created by an admin (or the seed) and land on `/seller`.
      They never see buyers, carts or money.
    - **A seller sends stock offers** (product owner, 2026-10-19; how sellers will work is still
      open, so it is kept as simple as possible). `/seller` lists their offers (name, total
      amount, date, status: Waiting for review / Accepted / Declined, and our note) with a round
      **+** "Add product" button. The form has three boxes: **Product name**, **Description**
      (details about the stock) and **Amount** (the total selling price for all of it), then
      **Send for review**. Admins get an in-app notice and answer at **Admin → Offers**: Accept
      or Decline, each with an optional note; the seller is told in the app. An offer is not a
      shop product: if we take the stock, the admin lists it as a product. Table `StockOffer`;
      `createOffer` / `decideOffer` in `src/server/offers.ts`.
    - Sellers have one section like admins: no Home/Shop/Carts tabs, no messages icon, no tab bar;
      `/`, `/shop`, `/carts`, `/my-carts`, `/dashboard`, `/messages` and `/c/<code>` send them to
      `/seller`. Their profile has their name, mobile, **factory address and an exact map pin**
      (product owner, 2026-10-20), shown to the admin on their stock offers. **Only buyers (`CUSTOMER`) can start, join
      or add to a cart** (`assertOneCart`), and sellers and packing staff can't send chat messages.
    - **Admins** come only from the seed. They have no home page, shop or buyer carts: `/` and `/my-carts` redirect them to `/admin`, `/shop` to `/admin/products`, `/carts` to `/admin/carts`; their header shows only Admin and on phones there is no bottom tab bar (the logo goes to `/admin`) (product owner, 2026-10-18).
12. **One cart at a time** (product owner, 2026-10-17). A buyer can own or be in only one active
    cart. Active means `OPEN`/`READY` and not expired, `AWAITING_SLIP` inside its 2h window, or
    `SLIP_REVIEW`. Starting, joining or adding to another cart is refused until the first is
    confirmed, expired, cancelled or left. Rule: `isActiveCart` in `src/lib/cart-rules.ts`;
    enforced by `assertOneCart` in `carts/service.ts` (per-user advisory lock).
13. **Address with an exact map pin** (product owner, 2026-10-17). Sign-up, joining a cart and
    starting a cart all need the buyer's address **and a pin on the map**, like choosing a PickMe
    pick-up point (tap the map, drag the pin, or "Use my location"). The pin is mandatory and must
    be inside Sri Lanka (`src/lib/location.ts`). It is saved on the profile and snapshotted on
    `CartMember` (`address`, `city`, `lat`, `lng`); the owner's pin is copied to
    `GroupCart.deliveryLat/deliveryLng` on accept for the PickMe booking. Older accounts with no pin
    are sent to the profile page `/account` first, which also holds the address used for
    delivery when the owner accepts (no address form on the cart page). The map is Leaflet + OpenStreetMap tiles, loaded from a
    CDN only on pages that show it (free, no key).
14. **Merging into a friend's cart** (product owner, 2026-10-17). A buyer already in a cart can
    ask to join another. Only that cart's **owner** can accept. On accept, the buyer's items move
    into the other cart (their stock stays locked, nothing is released), they become a member and
    can add more, and the cart they left is **deleted** (or, if it was someone else's, they just
    leave it). It only works while both carts are OPEN/READY and unexpired, and a cart the buyer
    owns can only be merged if nobody else is in it. One pending request per buyer; the owner can
    decline and the buyer can cancel. Rule: `mergeBlockReason` in `src/lib/cart-rules.ts`; flow:
    `requestMerge` / `acceptMerge` / `declineMerge` / `cancelMerge` in `carts/service.ts`
    (`CartMergeRequest` table). Cart page: "Ask to join and move my items here" and, for the
    owner, an "Asking to join" card.
15. **Open carts are sorted nearest-first and searchable** (product owner, 2026-10-17). For a
    signed-in buyer with a map pin, the open carts panel lists carts by distance from their pin
    to the cart's delivery point (the owner's drop-off pin once accepted, else the owner's own
    pin); carts with no pin come last. Without a pin (or signed out) it is newest first, with a
    hint to pin a location. Buyers can also search by cart name (also code and owner name).
    Rule: `distanceKm` / `sortNearest` in `src/lib/distance.ts`; query: `recentCarts` in
    `carts/queries.ts`; page: `/carts`.
16. **Carts are named after their owner** (product owner, 2026-10-17): "Navod Caldera's cart".
    Buyers aren't asked for a cart name; `createCart` sets it from the owner's name.
17. **Packing staff** (product owner, 2026-10-18; two-person flow 2026-10-19). People in our
    store who sort and pack orders (`PACKER`) are created by an admin at `/admin/users/new-packer`
    (or the seed) and land on `/packing`, a phone-first list of paid orders (CONFIRMED/DISPATCHED):
    **To gather → To pack → For PickMe**, plus today's handovers. Above them, **To receive** lists
    sellers' stock offers an admin has accepted (product owner, 2026-10-20): a packer opens one
    (details, seller contact and factory address, no amount) and presses **Received** when the
    stock arrives, which records who and when and tells the seller and the admins
    (`src/server/receiving.ts`, `/packing/stock/<id>`, `StockOffer.receivedBy/receivedAt`). Packing pages show only what the
    packer needs, in the fewest words (product owner, 2026-10-19): code, item count, one short
    status line; no owner, city, times or explanations. Every packer gets an in-app notice when a
    slip is approved ("New order to pack") and when PickMe is booked. On an order
    (`/packing/<code>`, items by member, no prices, the drop-off label) there are **two steps by
    two different people** (product owner, 2026-10-19): first one person checks every item and
    gathers it all together ("Checked and gathered"); then **someone else** rechecks every item
    and packs it ("Rechecked and packed"). The person who gathered an order can't pack it. Only
    once it is packed **and** the admin has booked PickMe can someone press "Handed to the PickMe
    driver", which records who handed it over, moves the drop to PICKED_UP and tells the owner.
    Until it is packed anyone can send it back to be gathered again ("Something wrong?"; once
    packed it is final, product owner 2026-10-20). **The two
    people who certified the order (gathered by, packed by) and who handed it over are shown with
    the order on the admin side**: each order's card on **Admin → Orders**, the cart page's
    timeline, the packer's user page and the orders CSV (product owner, 2026-10-21, rule 19). Packing staff never see money; `/`, `/shop`, `/carts`, `/my-carts` and
    `/dashboard` send them to `/packing`, and they have no phone tab bar. Rules: `packingStage` /
    `packBlockReason` / `handOverBlockReason` in `src/lib/packing-rules.ts`; flow: `markGathered` /
    `markPacked` / `sendBack` / `handOver` in `src/server/packing.ts` (cart row locked); table
    `Packing` (`gatheredBy`, `packedBy`, `handedOverBy`).

18. **No product statuses: stock decides** (product owner, 2026-10-20). Draft, In review, Live and
    Archived are gone. A product is in the shop (listing, search, home page, brands) while it has
    free stock in some size (`IN_SHOP` in `src/server/catalogue.ts`); a new product shows once
    stock is added, and one with no free stock (emptied or sold out) is hidden. To stop selling
    something, remove its free stock; pieces already in carts stay locked. Product pages still
    open by link. Admin → Products filters: All / In the shop / Not in the shop / Low stock.
    `Product.status` and `reviewNote` stay in the schema, unused; the seller-product review
    (`src/server/seller.ts`, publish / return) was removed.

19. **Admin: one home per task** (product owner, 2026-10-21). Tabs: **Stock · Lots · Slips ·
    Orders · Carts · Products · Offers · Users · Settings** (Stock and Lots replaced Sales, rule 20); red counts on Slips (slips to review), Orders
    (PickMe to book + failed drops) and Offers (to answer), a grey one on Products (low-stock
    sizes). **Stock** (`/admin`, landing, rule 20) holds the only Export CSV. **Orders**
    (`/admin/orders`, replaces Packing and Deliveries, which redirect there) holds every paid order
    by stage: To book / In store / On the way / Failed / Delivered (`orderStage` in
    `src/lib/packing-rules.ts`). It is the only place to book PickMe (form on the order's card),
    to mark a drop Delivered or Failed, and to book a failed drop again; it shows who gathered,
    packed and handed it over. **Carts** finds and shows carts: no tiles, no export, no buttons in
    the list (one line of what happens next); a cart's page has its details, items, shares,
    timeline (including PickMe and packing steps) and drop-off, and its only action is Cancel.
    Slips, Products, Offers, Users and Settings keep their own tasks. No explanation text.

20. **Empty the store fast: bulk lots and the Stock page** (product owner, 2026-10-21). The goal
    is not to know the best sellers but to clear each bulk from our store (**6,000 pieces**) as
    fast as possible so the next bulk can come in. **Admin → Lots** (`/admin/lots`): an admin
    enters each bulk we buy: name, pieces, **bulk cost, transport and wages** (LKR) and the day it
    arrived. Total cost ÷ pieces = cost per piece. A product picks its lot on the product form
    (`Product.lotId`) and then has no typed price: it sells at **cost + 20% for the first 7 days
    after the lot arrived, then cost + 10%**, rounded up to the whole rupee. The drop happens in
    `sweep()` (`reduceDueLots`), so it needs no worker; cart lines keep the price they were
    added at. Products with no lot keep a typed price. Store size and the margins/days are in
    **Settings → Stock**; each lot snapshots the margins and days when it is created (edits keep
    them). **Stock** (`/admin`, the landing page, replaced Sales) shows pieces: in store (free +
    in carts + paid but not handed to PickMe + a lot's pieces not listed yet) against the store
    size, average age, pieces out in 7 days (handed to PickMe), days to clear at the 28-day pace,
    age bands (0–7 / 8–14 / 15–30 / over 30 days), pieces in (lots) and out per week for 8 weeks,
    the oldest stock (free pieces × days, red over 30 days), lots (days, in store, sold %, cost
    back %), room for the next lot with offers waiting, carts short of the minimum closing within
    6h, odd sizes left, carts over 30 days (paid vs back to the shelf), and one sales card
    (today / 7 / 30 days, in carts). No best sellers. Rules: `src/lib/stock-rules.ts`; lots:
    `src/server/lots.ts`; figures: `storeSnapshot` / `stockDashboard` in `src/server/stock.ts`;
    table `Lot`.

Cart statuses: `OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED`,
plus the dead ends `EXPIRED` and `CANCELLED`. 14. **Owner chat** (product owner, 2026-10-17). The cart page no longer shows a delivery-point map
(removed 2026-10-17); the owner's pin is only used for "N km away" on the open carts list (the cart page dropped it, 2026-10-18) and the PickMe booking. Any signed-in user can message the
cart's owner in a private thread (`CartMessage`, `src/server/carts/chat.ts`); the owner has an
inbox of people who wrote and cannot start a thread, except with someone asking to join their cart: the "Asking to join" card has a "Message" button (product owner, 2026-10-17; `newThreadWith`). Max 500 characters, 10 messages a minute,
one unread in-app notice per conversation. The sender sees WhatsApp-style ticks: one grey tick
sent, two green ticks seen (the other side opened the conversation). The chat island polls `/api/chat` every 8 s while the
tab is visible (no websocket or worker).

## Code

- Next.js 16 App Router, React 19, Tailwind 4, Prisma 7 + PostgreSQL, zod, decimal.js.
- Pure rules with no database live in `src/lib/cart-rules.ts`, with unit tests beside them.
  Change rules there first.
- Services are in `src/server/`. All cart changes go through `carts/service.ts` and
  `carts/slips.ts`, inside `db.$transaction` with the cart row locked (`SELECT … FOR UPDATE`).
- Money is `Decimal(14,2)` in the DB and `D` from `src/lib/decimal.ts` in code. Never use a JS
  `number` for money; convert Prisma decimals with `toD`.
- Deadlines: `sweep()` runs from `POST /api/cron/sweep` (bearer `CRON_SECRET`) and also on page
  loads, so it works even without a cron.
- **No explanation text anywhere** (product owner, 2026-10-20): no `PageHeader` description, no
  lines explaining a page or a flow. Titles, data and actions only, in the fewest words.
- **Success messages are pop-ups** (product owner, 2026-10-20): a server action calls
  `flash("…")` (`src/server/flash.ts`) and `FlashToast` in the root layout shows it as the
  green-bordered `Toast`. No inline success boxes; `Alert` is for errors.
- Notifications are in-app only: `src/server/notify/index.ts`. The product owner removed email
  sending (2026-10-17); email addresses are only used to sign in and to find users to invite.
- Delivery: `src/server/delivery/provider.ts`. The default is the manual provider, where the admin
  enters the PickMe booking. The `PickMeProvider` request shape is **assumed** until we get PickMe
  business API docs and keys.
- Uploads (bank slips, product photos) go to local disk (`STORAGE_DIR`) behind
  `src/server/storage`. Swap in object storage once hosting is chosen (hosting is undecided).
- Every page, action and route that needs a user calls `requireUser()` or `requireAdmin()` first.

## Commands

|                      |                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run db:start`   | Local Postgres: dev on 5546, test on 5547 (no install needed)                                                                                                                                                      |
| `npm run db:migrate` | New migration and client regenerate (never `prisma migrate dev` alone)                                                                                                                                             |
| `npm run db:seed`    | Demo data, all `password123`: `admin@groupbasket.lk`, `seller@example.com`, `packer@example.com`, `packer2@example.com`, `buyer@example.com`, `buyer2@example.com`, `buyer3@example.com` (listed on the sign-in page in dev, or with `SHOW_DEMO_LOGINS=true`) |
| `npm run dev`        | http://localhost:3002                                                                                                                                                                                              |
| `npm run check`      | Typecheck, lint and unit tests                                                                                                                                                                                     |
| `npm run test:int`   | Integration tests on the test DB                                                                                                                                                                                   |
| `npm run e2e`        | Playwright journeys (port 3200, test DB)                                                                                                                                                                           |

## Agents (`.claude/agents/`)

| Agent             | Use for                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `grouptogether`   | The full project brief: business, rules, lifecycle, data model, routes, code map, env, open decisions. Start here for cross-cutting work. |
| `backend-data`    | Schema, migrations, seed, Prisma conventions                                                                                              |
| `carts`           | Cart lifecycle, stock locking, 50,000 threshold, 24h/2h deadlines, invites                                                                |
| `payments-slips`  | The owner's single bank slip, admin approve/reject                                                                                        |
| `delivery`        | One PickMe drop to the owner (the owner pays the driver), providers, webhook                                                              |
| `notifications`   | In-app notices: who gets what                                                                                                             |
| `catalogue-admin` | Products, stock by size, the admin back office                                                                                            |
| `frontend`        | Pages and components (speed first, mobile first)                                                                                          |
| `qa-review`       | Rule checklist and the test suites                                                                                                        |

Every rule the product owner states goes into CLAUDE.md **and** the relevant agent files.

**Change log:** every change the product owner asks for is also noted in `docs/CHANGES.md`, in the
same piece of work as the code, and the matching agent files are updated alongside it.
