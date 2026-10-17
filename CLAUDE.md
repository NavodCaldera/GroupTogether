# GroupTogether

Group buying for **factory-surplus and B-grade shoes and apparel** in Sri Lanka. We buy stock in
bulk; every order must reach a minimum value, so shoppers fill **shared carts** together. Every
amount is in LKR.

This is a standalone project. It shares no code, database or rules with any other site.

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
   OWNER.
9. **Visibility.** A cart is PUBLIC (shown on the "open carts" panel) or PRIVATE (reached only by
   link). Every cart has a share link `/c/<code>`. The invite-by-email/phone form and the share
   icon (copy link / WhatsApp) were removed from the cart page (product owner, 2026-10-17); the
   buyer dashboard's "Copy cart link" button (while the cart is filling) is the way to share; it
   replaced "Share on WhatsApp" (product owner, 2026-10-17).
10. **B-grade products are labelled "B-grade"; defects are not listed** (product owner,
    2026-10-17: the defects box and field were removed). `Product.defectNotes` stays in the
    schema, unused, so old notes aren't lost.
11. **Three roles: buyer, factory seller, admin** (product owner, 2026-10-16).
    - **Buyers** (`CUSTOMER`) sign up themselves and land on `/dashboard`.
    - **Factory sellers** (`SELLER`) are created by an admin (or the seed) and land on `/seller`.
      **A seller only publishes stock.** They see their own products and stock counts, never
      buyers, carts or money.
    - A seller's product goes `DRAFT → IN_REVIEW` (seller submits; it needs stock in a size)
      `→ LIVE` (an admin publishes it once the stock has reached our store). Alternatively the
      admin returns it to `DRAFT` with a note. Sellers change details and stock only while it's a
      draft. **We hold the stock**, so a live product is managed by the admin.
    - **Admins** come only from the seed. They have no home page: `/` redirects them to `/admin`, and the header has no Home tab for them (the logo goes to `/admin`) (product owner, 2026-10-18).
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
| `npm run db:seed`    | Demo data, all `password123`: `admin@grouptogether.lk`, `seller@example.com`, `buyer@example.com`, `buyer2@example.com`, `buyer3@example.com` (listed on the sign-in page in dev, or with `SHOW_DEMO_LOGINS=true`) |
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
