---
name: backend-data
description: "Database schema, Prisma migrations, seed data and data-access conventions for GroupTogether. Use for prisma/schema.prisma, prisma/migrations, prisma/seed.ts, src/server/db.ts and src/server/settings.ts."
---

## Project at a glance

GroupTogether is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

- Shoppers fill shared carts. Each cart needs **LKR 50,000** (snapshotted per cart) and expires **24h** after creation.
- **Stock is locked as soon as an item is added.** Reaching the minimum **notifies every member in the app**.
- **Log every product-owner change** in `docs/CHANGES.md` and update the matching agent files in the same piece of work.
- Only the **owner pays**, for the whole cart. After "Accept & pay" they have **2h to upload one bank slip**, or the cart is cancelled and its stock released.
- An admin approves the slip (CONFIRMED) or rejects it (a fresh 2h window). **There are no refunds.**
- Delivery is **one PickMe drop to the owner, who pays the driver**. The platform never touches the fee.
- Carts are PUBLIC (on the open-carts panel) or PRIVATE (link or invite only).
- Priorities: **speed and minimum cost**.
- Stack: Next.js 16, React 19, Prisma 7 + Postgres, Tailwind 4, zod, decimal.js.
- Statuses: OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED, plus EXPIRED and CANCELLED.

The full brief is in `.claude/agents/grouptogether.md` and `CLAUDE.md`. Read them when your task touches another area.

## Your area: data

**Files:** `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `prisma.config.ts`, `src/server/db.ts` (exports `db` and the `Tx` type; in dev the client cached on `globalThis` is replaced when `prisma generate` produces a new `PrismaClient` class, so a migration doesn't need a dev-server restart), `src/server/settings.ts`, `scripts/local-db.mjs`.

**Models:** User, Session, Product, Variant, GroupCart, CartMember, CartLine, PaymentSlip, CartInvite, Notification, Delivery, Settings.

- Money is `Decimal(14,2)`. Convert it with `toD()` from `src/lib/decimal.ts`, never `Number()`.
- `Variant` has three counters that together make up everything ever stocked: `available` (free), `reserved` (locked in carts that hold stock) and `sold`.
- `GroupCart.total` is denormalised. Recompute it from the lines in the same transaction as any line change.
- `CartLine.unitPrice` is a snapshot taken when the line is first added. `GroupCart.minOrderValue` is a snapshot of Settings.
- Closed carts (EXPIRED, CANCELLED) keep their lines as history but hold no stock.
- `Delivery.paidBy` is always `"OWNER"`.
- `Settings` is a single row with id 1. `getSettings()` creates it with the defaults (50000, 24h, 2h) if it is missing.
- Useful indexes: `GroupCart(status, visibility, createdAt)` for the panel, and `(status, expiresAt)` / `(status, slipDueAt)` for the sweep.

**Migrations:**

- Run `npm run db:migrate` to create a migration and regenerate the client. Never edit an applied migration.
- The client is generated to `src/generated/prisma` (git-ignored).
- Name migrations in snake_case.

**Local databases:**

- `npm run db:start` starts embedded Postgres: dev on 5546 (`grouptogether`), test on 5547 (`grouptogether_test`). No install or password needed; the data lives in `.data/pg`.
- The test DB is wiped by the tests. It must never equal `DATABASE_URL`.

**Seed** (`npm run db:seed`):

- Empties every table, then loads the bank details, 1 admin (`admin@grouptogether.lk`) and the only 3 buyers (`buyer@`, `buyer2@` and `buyer3@example.com`: Dilan, Sachini, Tharindu), all with the password `password123`.
- Then 20 LIVE products (10 shoes in UK 6–11, 10 apparel in S–XL; mixed surplus and B-grade).
- Then the carts, locking stock exactly as the app does and keeping rule 12 (one active cart per buyer): Dilan's public "Office sneaker run" at 49,800 and Sachini's PRIVATE "Sachini's friends only" (READY). Tharindu is in no active cart, so the e2e journey has him join Dilan's cart.
- Dilan also has a DELIVERED order (with Tharindu; its stock is `sold`, with a manual delivery and no slip file) and an invite to Sachini's private cart.
- Then the demo seller `seller@example.com` (Ceylon Footwear Mills): one product LIVE, one IN_REVIEW (B-grade) and one DRAFT returned with a `reviewNote`.
- Later picks skip variants already in a cart (`used`), so the original carts keep their variants.
- The e2e tests depend on these accounts, cart names and the 49,800 total. Update `tests/e2e/journey.spec.ts` if you change them.

**Speed and cost:**

- Select only the fields a page needs.
- Avoid N+1 queries: use `include`/`select`, or `Promise.all` for independent reads.
- Keep the pool at `DATABASE_POOL_MAX` (default 10).

Rule 13 columns: `User.lat/lng`, `CartMember.address/city/lat/lng`, `GroupCart.deliveryLat/deliveryLng` (Float, nullable for old rows). Validation lives in `src/lib/location.ts` (`locationSchema`, `pinFields`, Sri Lanka bounds). The seed pins its demo users.

- `CartMergeRequest` (`userId`, nullable `fromCartId` set null when that cart is deleted, `toCartId` cascade, `status`: `PENDING|ACCEPTED|DECLINED|CANCELLED`). A hand-added partial unique index allows one `PENDING` request per user (see its migration).
  `CartMessage` (cartId, participantId, authorId, body) holds owner chat threads; cascade-deleted with the cart or user.

- Seeded carts are named `"<owner name>'s cart"` (the seed ignores its label argument).

- `CartMessage.readAt` (null = unread by the non-author side), indexed with `participantId`.
