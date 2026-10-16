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
4. **When the minimum is reached** (OPEN → READY), every member is notified **by email (Gmail
   SMTP) and in the app**. If the total drops below the minimum, the cart goes back to OPEN.
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
   link or invite). Every cart has a share link `/c/<code>` and a WhatsApp share. Members can
   invite registered users by email or mobile number.
10. **B-grade products must list their defects**, and the defects are shown up front.

Cart statuses: `OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED`,
plus the dead ends `EXPIRED` and `CANCELLED`.

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
- Email: `src/server/notify/mailer.ts`. `MAILER=gmail` needs `GMAIL_USER` and
  `GMAIL_APP_PASSWORD`; otherwise mails go to a mock.
- Delivery: `src/server/delivery/provider.ts`. The default is the manual provider, where the admin
  enters the PickMe booking. The `PickMeProvider` request shape is **assumed** until we get PickMe
  business API docs and keys.
- Uploads (bank slips, product photos) go to local disk (`STORAGE_DIR`) behind
  `src/server/storage`. Swap in object storage once hosting is chosen (hosting is undecided).
- Every page, action and route that needs a user calls `requireUser()` or `requireAdmin()` first.

## Commands

|                      |                                                                        |
| -------------------- | ---------------------------------------------------------------------- |
| `npm run db:start`   | Local Postgres: dev on 5546, test on 5547 (no install needed)          |
| `npm run db:migrate` | New migration and client regenerate (never `prisma migrate dev` alone) |
| `npm run db:seed`    | Demo data. Password `password123`; admin `admin@grouptogether.lk`      |
| `npm run dev`        | http://localhost:3002                                                  |
| `npm run check`      | Typecheck, lint and unit tests                                         |
| `npm run test:int`   | Integration tests on the test DB                                       |
| `npm run e2e`        | Playwright journeys (port 3200, test DB)                               |
