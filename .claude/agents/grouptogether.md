---
name: grouptogether
description: "Lead agent for GroupTogether with the full project brief (business, rules, statuses, data model, routes, files, env, commands, open decisions). Use for any task that spans several areas, for planning, or when unsure which specialist fits."
---

# GroupTogether: full project brief

## 1. What it is

GroupTogether is a group-buying website for **factory-surplus and B-grade shoes and apparel** in Sri Lanka.

- The business buys stock in bulk and sells it cheaply, but every order must be worth at least **LKR 50,000**.
- Few shoppers reach that alone, so they fill **shared carts** together.
- Once a cart reaches the minimum, the **cart owner** pays for the whole cart by bank transfer and uploads one bank slip.
- An admin confirms the payment, and the order goes out in **one PickMe drop to the owner**. The owner pays the driver the delivery fee.
- Members settle their share with the owner outside the platform.

It is a standalone project: it shares no code, database or rules with any other site (including the shoe-rental sites in `E:\Projects\New\Shoes subscritpion model`). Never copy their rules, palette or pricing.

- Location: `E:\Projects\New\GroupTogether`.
- Git: its own repo on `main`, no remote yet.
- Currency: LKR. Time zone for display: Asia/Colombo.

**Top priorities: speed and minimum running cost.**

- Server-rendered pages, system fonts, no UI libraries.
- Small client islands only.
- No paid services or always-on workers.
- Hosting is not chosen yet.

## 2. Business rules (product owner, 2026-10-16)

1. **The minimum order value is LKR 50,000 per cart**, summed over all members' lines.
   - Admins can change it in Settings.
   - Each cart snapshots `minOrderValue` when it is created, so later changes don't affect existing carts.
2. **Stock is locked when an item is added to a cart.**
   - Adding: `Variant.available` goes down and `reserved` goes up, in one atomic `updateMany` guarded by `available >= delta`.
   - Release: removing the item, leaving the cart, expiry and cancellation release it.
   - Approving the slip moves it from `reserved` to `sold`.
   - Stock can never be oversold; this is tested with concurrent adds.
3. **A cart expires 24h after it is created** if the owner hasn't accepted it.
   - Expiry releases the stock.
   - The lines are kept as history, and closed carts hold no stock.
4. **Reaching the minimum** moves the cart OPEN → READY and **notifies every member in the app (email sending was removed on 2026-10-17)**, once per crossing. If the total drops below the minimum, the cart goes back to OPEN.
5. **Only the owner pays, for the whole cart.**
   - The owner presses "Accept & pay" (READY → AWAITING_SLIP). This freezes the cart (no joins or edits) and records the drop-off address, city and phone.
   - The owner then has **2 hours** (`slipWindowHours`) to upload **one bank slip**.
   - If no slip is uploaded in time, the cart is CANCELLED and its stock released.
6. **The slip is reviewed** (SLIP_REVIEW; uploading stops the timer).
   - An admin **approves** it (→ CONFIRMED, reserved becomes sold).
   - Or the admin **rejects** it with a reason (→ AWAITING_SLIP with a fresh 2h window).
   - The owner can't cancel while a slip is in review; an admin can.
7. **There are no refunds anywhere in the system.** Stock is locked from the start, so a paid cart is always in stock.
8. **Delivery is one PickMe drop to the cart owner.**
   - **The owner (the receiver) pays the driver directly.**
   - The platform never charges, collects or refunds a delivery fee. `Delivery.paidBy` is always `OWNER`, and `quotedFee` is only shown to the owner.
9. **Visibility and sharing.**
   - A cart is PUBLIC (shown on the "open carts" panel) or PRIVATE (reached only by link or invite).
   - Every cart has a share link `/c/<CODE>` (8 characters, no look-alike characters). Sharing is the "Copy cart link" button on the buyer dashboard (it replaced "Share on WhatsApp", 2026-10-17; `whatsappShareUrl` is unused); the cart page's share icon was removed (2026-10-17).
   - Any member can invite a registered user by email or mobile number; the invitee gets an in-app notice.
   - Anyone with the link can join while the cart is OPEN or READY.
10. **B-grade products are labelled "B-grade"; defects are not listed** (product owner, 2026-10-17). No defects field in the admin or seller forms and no defects box on the product page; `Product.defectNotes` stays in the schema, unused.
    11b. **Change log:** every change the product owner asks for is noted in `docs/CHANGES.md` and the matching agent files are updated in the same piece of work.
    11f. **Cart names** (product owner, 2026-10-17): a cart is named after its owner ("Navod Caldera's cart"); buyers don't type a name (`createCart` sets it).
    11e. **Open carts nearest-first** (product owner, 2026-10-17): `/carts` sorts by distance from the signed-in buyer's map pin to each cart's delivery point (`distanceKm`, `sortNearest` in `src/lib/distance.ts`, `recentCarts` in `carts/queries.ts`), unknown pins last, newest first when the buyer has no pin; plus a search box (name, code, owner name).
    11d. **Merge into a friend's cart** (product owner, 2026-10-17): a buyer in an active cart can ask to join another cart; its owner accepts or declines. On accept their items move over (stock stays locked), they join, and their old cart is deleted (or they just leave it if it was someone else's). Both carts must be OPEN/READY and unexpired; a cart they own must have no other members. `mergeBlockReason` in `cart-rules.ts`; `requestMerge`/`acceptMerge`/`declineMerge`/`cancelMerge` in `carts/service.ts`; table `CartMergeRequest`.
    11c. **One cart at a time** (product owner, 2026-10-17): a buyer can own or be in only one active cart (`OPEN`/`READY` not expired, `AWAITING_SLIP` in its window, `SLIP_REVIEW`). Starting, joining or adding to another is refused until it is confirmed, expired, cancelled or left. `isActiveCart` in `cart-rules.ts`; `assertOneCart` in `carts/service.ts`; the product page hides "Start a new cart" and `/carts/new` shows a notice when the buyer already has one.
11. **Accounts and roles** (product owner, 2026-10-16).
    - **Buyers** (`CUSTOMER`) sign up themselves with name, email, a Sri Lankan mobile (`07XXXXXXXX`), address, city and password. They land on `/dashboard`.
    - **Factory sellers** (`SELLER`, with a `company`) are created by an admin at `/admin/users/new-seller`, or by the seed. They land on `/seller`.
      - **A seller only publishes stock.** They see their own products and stock counts, never buyers, carts, sales or money.
      - A seller's product goes `DRAFT → IN_REVIEW → LIVE`. The seller submits it, which needs free stock in at least one size.
      - An admin publishes it once the stock has reached our store, or returns it to `DRAFT` with a `reviewNote`. The seller is notified in the app either way.
      - Sellers change details and stock only while the product is a draft. **We hold the stock**, so a live product is managed by the admin.
      - A seller can withdraw a product from review, or delete a draft that never reached a cart.
    - **Packing staff** (`PACKER`) are created by an admin at `/admin/users/new-packer`, or by the seed (`packer@`, `packer2@`, `packer3@example.com`). They land on `/packing` (rule 12 below).
    - **Admins** only come from the seed.
    - Wrong-role visits redirect to the user's own home (`homeFor`).
12. **Packing staff** (product owner, 2026-10-18). People in our store who sort and pack orders
    (`PACKER`) are created by an admin at `/admin/users/new-packer` (or the seed) and land on
    `/packing`, a phone-first list of paid orders (CONFIRMED/DISPATCHED): **To pack → To check →
    Ready for PickMe**, plus today's handovers. Every packer gets an in-app notice when a slip is
    approved ("New order to pack") and when PickMe is booked. On an order (`/packing/<code>`, items
    by member, no prices, the drop-off label) one person presses "I've packed it", then **two
    other people** each press "Checked: everything is correct". **Checking and packing are never
    done by the same person** (product owner, 2026-10-19), and nobody checks twice, so every order
    takes three people. Only after two checks **and** once the admin has booked PickMe can someone
    press "Handed to the PickMe driver", which records who handed it over, moves the drop to
    PICKED_UP and tells the owner. Before handover a checker can send it back to be packed again
    (clears the packing and its checks). **Who packed, who certified it and who handed it over are
    shown with the order on the admin side**: cart page (Packing card + timeline), carts list,
    deliveries and the orders CSV. Packing staff never see money; `/`, `/shop`, `/carts`,
    `/my-carts` and `/dashboard` send them to `/packing`, and they have no phone tab bar. Rules:
    `packingStage` / `checkBlockReason` / `handOverBlockReason` in `src/lib/packing-rules.ts`; flow:
    `markPacked` / `checkPacking` / `repack` / `handOver` in `src/server/packing.ts` (cart row
    locked); tables `Packing`, `PackingCheck`.

## 3. Cart lifecycle

```
OPEN ──(total ≥ min)──▶ READY ──(owner accepts)──▶ AWAITING_SLIP ──(slip uploaded)──▶ SLIP_REVIEW
  ▲                       │                            │   ▲                              │   │
  └──(total < min)────────┘                            │   └──────(admin rejects)─────────┘   │
                                                       │                               (admin approves)
OPEN/READY ──(24h passed)──▶ EXPIRED                  (2h passed)──▶ CANCELLED            ▼
OPEN/READY/AWAITING_SLIP ──(owner cancels)──▶ CANCELLED                               CONFIRMED
any of the 4 pre-confirmed states ──(admin cancels)──▶ CANCELLED                          │ (admin books PickMe)
                                                                                      DISPATCHED ──▶ DELIVERED
```

- Editable states: OPEN and READY.
- States that hold stock: OPEN, READY, AWAITING_SLIP and SLIP_REVIEW.
- The deadlines are applied by `sweep()` (see §6).

## 4. Data model (`prisma/schema.prisma`, PostgreSQL)

Money is `Decimal(14,2)`.

- `User`:
  - Fields: role `CUSTOMER|ADMIN|SELLER|PACKER`, name, email (unique), phone (unique), passwordHash (scrypt), address, city, locked.
  - `Session`: id = SHA-256 of the cookie token, 30 days.
- `Product`:
  - Fields: title, brand, description, category `SHOES|APPAREL`, stockType `FACTORY_SURPLUS|B_GRADE`, defectNotes (unused since 2026-10-17), retailPrice, price, status `DRAFT|LIVE|ARCHIVED`, photoKey and photoType (one photo).
  - `Variant`: size, colour, `available`, `reserved`, `sold`, unique per (product, size, colour).
- `GroupCart`:
  - Identity: code (unique), name, owner, visibility `PUBLIC|PRIVATE`, status.
  - Money: `minOrderValue` (snapshot), `total` (kept in step with the lines in the same transaction).
  - Timing: `expiresAt`, `readyAt`, `acceptedAt`, `slipDueAt`, `confirmedAt`.
  - Delivery: `deliveryAddress`, `deliveryCity`, `deliveryPhone`.
  - `closedReason`.
- `CartMember`: one row per user per cart.
- `CartLine`: one row per (cart, user, variant) with qty and a `unitPrice` snapshot taken when first added.
- `PaymentSlip`:
  - Fields: cart, uploader (owner), amount (the cart total), storageKey, contentType, status `PENDING|APPROVED|REJECTED`, reviewNote, reviewer, reviewedAt.
  - A rejected slip can be replaced by a new one.
- `CartInvite`: (cart, invited user), invitedBy.
- `Notification`: user, title, body, href, readAt.
- `Delivery`: one per cart.
  - Fields: provider, externalRef, status `BOOKED|PICKED_UP|DELIVERED|FAILED|CANCELLED`, quotedFee, `paidBy = "OWNER"`, driverName, trackingUrl (`driverPhone` stays in the schema, unused).
- `Packing`: one per cart once packed: packedBy/packedAt, handedOverBy/handedOverAt. `PackingCheck`: (packing, user) unique, createdAt; two are needed. Deleting the packing (send back) deletes its checks.
- `Settings`: a single row, id 1.
  - Defaults: minOrderValue 50000, cartLifetimeHours 24, slipWindowHours 2.
  - Also holds bankName, bankBranch, accountName and accountNumber (shown on the pay page).

## 5. Pages and routes (`src/app`)

| Route                                      | Who                  | What                                                                                                                                                                   |
| ------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                        | anyone               | Hero, recent public carts panel (6), how it works, new products                                                                                                        |
| `/carts`                                   | anyone               | The full open-carts panel: PUBLIC carts that are OPEN or READY and not expired, newest first                                                                           |
| `/carts/new`                               | signed in            | Start a cart (name, public/private)                                                                                                                                    |
| `/shop`                                    | anyone               | GET-form filters (search, category, stock type, brand, size); `?cart=CODE` carries a cart through                                                                      |
| `/products/[id]`                           | anyone               | Product, size picker; add to one of your carts, the shared cart from `?cart=`, or a new cart                                                                           |
| `/c/[code]`                                | anyone with the link | Progress, countdowns, members and their lines (yours editable), join, leave, accept form, share/WhatsApp/invite, cancel                                                |
| `/c/[code]/pay`                            | owner, AWAITING_SLIP | Bank details, amount, reference (the cart code), 2h countdown, slip upload                                                                                             |
| `/my-carts`, `/notifications`              | signed in            | Your carts; your notices (mark all read)                                                                                                                               |
| `/dashboard`                               | buyer                | To-dos (accept & pay, upload slip, pay the driver, carts about to expire, invites), active carts with your share, orders and delivery, latest notices                  |
| `/seller`, `/seller/products/new`, `/[id]` | seller               | Own products and stock by size; draft → submit for review; withdraw; delete a draft; read-only once live                                                               |
| `/packing`, `/packing/[code]`              | packing staff        | Paid orders to pack, to check (two people) and to hand to PickMe; an order's items by member, label, and the next step                                               |
| `/sign-in`, `/sign-up`                     | anyone               | `?next=` returns to where you were                                                                                                                                     |
| `/admin`                                   | admin                | To do (only non-zero items + running deadlines) and pipeline line; confirmed sales with a 14-day chart; recent orders, low stock, best sellers. Two columns on desktop |
| `/admin/slips`                             | admin                | Pending slips; open the file; approve (redirects to the cart) or reject with a reason. `?view=history`: the last 100 decisions                                         |
| `/admin/carts`, `/admin/carts/[code]`      | admin                | Needs-you tiles, search, stage tabs, next step per cart, urgency sort, paging; stage bar, picking list, members' shares, timeline, book PickMe, cancel                |
| `/admin/deliveries`                        | admin                | Confirmed carts to book; drops in progress with status buttons; recently delivered                                                                                     |
| `/admin/products`, `/new`, `/[id]`         | admin                | Search, status (incl. In review), seller and low-stock filters, free / in-cart / sold counts; edit; stock by size; publish or return a seller's product                |
| `/admin/users`, `/admin/users/[id]`        | admin                | Search and filter users (buyers, sellers, admins, locked); a user's carts, shares, slips and devices; lock or unlock; `/admin/users/new-seller` adds a factory seller  |
| `/admin/settings`                          | admin                | Minimum, time windows, bank account; system status (delivery, cron)                                                                                                    |
| `GET /admin/export/orders`                 | admin                | Confirmed orders of the last `?days=` (default 30) as CSV                                                                                                              |
| `GET /api/photos/[id]`                     | public               | Product photo (ETag, cached)                                                                                                                                           |
| `GET /api/slips/[id]`                      | uploader or admin    | Bank slip file, no-store                                                                                                                                               |
| `POST /api/cron/sweep`                     | `Bearer CRON_SECRET` | Runs `sweep()`                                                                                                                                                         |
| `POST /api/webhooks/pickme`                | HMAC `x-signature`   | Delivery status updates (payload shape ASSUMED)                                                                                                                        |

## 6. Code map

- `src/lib/cart-rules.ts`: the pure rules, with no database.
  - Statuses, EDITABLE / CANCELLABLE / HOLDS_STOCK, `cartTotal`, `progress`, `remaining`.
  - `statusAfterChange` (OPEN⇄READY), `overdue` (EXPIRE / SLIP_MISSED), `newCartCode`, `whatsappShareUrl`, `STATUS_LABEL`.
  - Tested in `cart-rules.test.ts`.
- `src/lib/decimal.ts`: `D`, `toD`, `roundMoney`. `src/lib/format.ts`: `formatLKR`, `formatDateTime`, `timeLeft`, `colomboDayStart`, `formatIsoDateTime`. `src/lib/csv.ts`: `toCsv` (defuses formula cells).
- `src/server/carts/service.ts`: `createCart`, `joinCart`, `setLine` (set, or add with `{add:true}`), `leaveCart`, `acceptAndPay`, `cancelCart`, `sweep`.
  - Every change runs in `db.$transaction` behind `lockCart()` (`SELECT … FOR UPDATE`), then recomputes the total and status.
- `src/server/carts/slips.ts`: `uploadSlip`, `approveSlip`, `rejectSlip`.
- `src/server/carts/invites.ts`: `inviteToCart`.
- `src/server/carts/queries.ts`: `recentCarts`, `cartByCode`, `editableCartsFor`, `joinableCart`, `myCarts`.
- `src/server/carts/actions.ts`: customer server actions. `src/server/admin-actions.ts`: admin server actions.
  - Expected errors (`CartError`, `UploadError`, `CatalogueError`, `AuthError`, `ZodError`) become form messages.
- `src/server/admin-queries.ts`: `overviewStats`, `adminBadges` (nav counts), `PAID` (CONFIRMED/DISPATCHED/DELIVERED, what sales count), `LOW_STOCK` (2).
- `src/server/catalogue.ts`: `listProducts`, `shopFacets`, `getProduct`, `saveProduct`, `adjustStock` (changes free stock only, never locked stock).
- `src/server/delivery/provider.ts`: `DeliveryProvider` with `ManualProvider` (the default) and `PickMeProvider` (request shape ASSUMED). `delivery/index.ts`: `bookDelivery`, `setDeliveryStatus`.
- `src/server/notify/index.ts`: `notify(userIds, notice)` writes the in-app rows. There is no email sending.
- `src/server/auth/`: scrypt passwords, session cookie `gt_session`, `getCurrentUser`, `requireUser(roles, next)`, `requireAdmin`, `setUserLocked` (customers only; locking deletes their sessions).
- `src/server/storage/`: local-disk storage (`STORAGE_DIR`), `checkUpload` and `saveUpload`. Limit 5 MB; images, plus PDF for slips.
- `src/server/settings.ts`: `getSettings()` creates the defaults row if it is missing.
- `src/components/`: `ui.tsx` (Button, Field, Input, Select, Card, Badge, Alert…), `cart-bits.tsx` (ProgressBar, StatusBadge, CartCard, ProductImage, StockTypeBadge), `client.tsx` (Countdown, CopyLink), `site-header.tsx`.
- `prisma/seed.ts`: 1 admin, 3 packing staff (Kasun `packer@`, Ishara `packer2@`, Ruwan `packer3@`; Kasun packed Dilan's delivered order, Ishara and Ruwan checked it), 1 seller (Ceylon Footwear Mills, with one product each live, in review and returned), exactly 3 buyers (Dilan `buyer@`, Sachini `buyer2@`, Tharindu `buyer3@example.com`), 20 products with variants, and the carts: Dilan's public one at 49,800, Sachini's private READY one, Dilan's delivered order, and Tharindu's paid (CONFIRMED) order waiting to be packed. Tharindu has no active cart.
- `src/server/seller.ts`: the seller listing flow (`sellerSaveProduct`, `sellerAdjustStock`, `submitForReview`, `withdrawFromReview`, `deleteDraft`) and admin review (`publishProduct`, `returnToSeller`). `src/server/seller-actions.ts`: the seller server actions (`requireSeller`).
- `src/lib/packing-rules.ts`: `CHECKS_NEEDED` (2), `PACKABLE`, `packingStage`, `checkBlockReason`, `handOverBlockReason`, `namesList` (tested). `src/server/packing.ts`: `markPacked`, `checkPacking`, `repack`, `handOver`, `packingQueue`, `packingOrder`, `packingSelect`. `src/server/packing-actions.ts`: packer server actions (`requirePacker`). `src/components/packing-bits.tsx`: `PackingTrail`, `packingSummary`, `checkedByText`.
- `src/server/carts/queries.ts` → `buyerDashboard`: a buyer's carts with their own lines, latest slip and delivery, open invites and the latest notices.

## 7. Environment (`.env.example`)

- Database: `DATABASE_URL` (5546), `TEST_DATABASE_URL` (5547), `DATABASE_POOL_MAX`.
- App: `APP_URL` (used in share links), `STORAGE_DIR`.
- Delivery: `DELIVERY_PROVIDER=manual|pickme`, `PICKME_API_URL`, `PICKME_API_KEY`, `PICKME_MERCHANT_ID`, `PICKME_WEBHOOK_SECRET`.
- Cron: `CRON_SECRET`.

## 8. Commands and ports

- `npm run db:start` / `db:stop`: embedded Postgres, dev on 5546 (`grouptogether`) and test on 5547 (`grouptogether_test`).
- `npm run db:migrate`: a new migration plus a client regenerate. `npm run db:seed`: wipes the DB and loads demo data. Every password is `password123`: admin `admin@grouptogether.lk`, seller `seller@example.com`, buyers `buyer@example.com`, `buyer2@example.com` and `buyer3@example.com`.
- `npm run dev`: http://localhost:3002.
- `npm run check`: typecheck, lint and unit tests.
- `npm run test:int`: integration tests against the test DB.
- `npm run e2e`: Playwright on port 3200 against the test DB.

## 9. Conventions

- Never use a JS `number` for money: use `D` and `toD`, and show amounts with `formatLKR`.
- Every page, action and route that needs a user calls `requireUser()` or `requireAdmin()` first.
- New cart rules go into `cart-rules.ts` (with unit tests), then the service (with an integration test).
- Call `notify()` after the transaction commits, never inside it.
- If an action removes its own form (approve, book), redirect with a query flag and show a banner.
- Next.js 16: read `node_modules/next/dist/docs/` before using unfamiliar APIs (see AGENTS.md). Use `PageProps<"/route">`, `LayoutProps` and `RouteContext`; params and searchParams are Promises.
- Run `npx prettier --write .` before committing. Commit to `main` and end commit messages with the Co-Authored-By line.

## 10. Open decisions and next steps

- **PickMe API:** needs a PickMe business (Flash) account. Map the real fields in `PickMeProvider.book` and the webhook. Until then the provider stays manual.
- **Hosting:** undecided. With serverless hosting, swap local-disk storage for object storage and schedule the sweep cron.
- **Bank account details** are entered in Admin → Settings.
- **Not built yet:** password reset, multiple photos per product, an SMS/WhatsApp API for notifications.

## Specialist agents

- `backend-data`: schema, migrations, seed, Prisma.
- `carts`: lifecycle, stock locks, deadlines, invites.
- `payments-slips`: bank slips.
- `delivery`: PickMe.
- `notifications`: in-app notices.
- `catalogue-admin`: products, stock, admin screens.
- `frontend`: pages and UI.
- `qa-review`: review and tests.

11d. **Address with an exact map pin** (product owner, 2026-10-17): sign-up, joining and starting a cart require an address plus a pin inside Sri Lanka (`src/lib/location.ts`, `components/location-picker.tsx`). Stored on `User`, snapshotted on `CartMember`, owner's pin copied to `GroupCart.deliveryLat/Lng`. Accounts without a pin go to `/account/location`.
11e. **Owner chat** (product owner, 2026-10-17): see CLAUDE.md rule 14. The cart page's delivery-point map was removed (2026-10-17).
Invites (product owner, 2026-10-17): the cart page no longer shows the invite-by-email/phone form; people join via the share link/WhatsApp. `InviteForm` and `inviteAction` are unused.
