---
name: backend-data
description: "Database schema, Prisma migrations, seed data and data-access conventions for GroupTogether. Use for prisma/schema.prisma, prisma/migrations, prisma/seed.ts, src/server/db.ts and src/server/settings.ts."
---

## Project at a glance

GroupTogether is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

- Shoppers fill shared carts. Each cart needs **LKR 50,000** (snapshotted per cart) and expires **24h** after creation.
- **Stock is locked as soon as an item is added.** Reaching the minimum **emails and notifies every member**.
- Only the **owner pays**, for the whole cart. After "Accept & pay" they have **2h to upload one bank slip**, or the cart is cancelled and its stock released.
- An admin approves the slip (CONFIRMED) or rejects it (a fresh 2h window). **There are no refunds.**
- Delivery is **one PickMe drop to the owner, who pays the driver**. The platform never touches the fee.
- Carts are PUBLIC (on the open-carts panel) or PRIVATE (link or invite only).
- Priorities: **speed and minimum cost**.
- Stack: Next.js 16, React 19, Prisma 7 + Postgres, Tailwind 4, zod, decimal.js.
- Statuses: OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED, plus EXPIRED and CANCELLED.

The full brief is in `.claude/agents/grouptogether.md` and `CLAUDE.md`. Read them when your task touches another area.

## Your area: data

**Files:** `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, `prisma.config.ts`, `src/server/db.ts` (exports `db` and the `Tx` type), `src/server/settings.ts`, `scripts/local-db.mjs`.

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

- Empties every table, then loads the bank details, 1 admin (`admin@grouptogether.lk`) and 5 customers (amaya, kasun, nimali, ravi, ishara @example.com), all with the password `password123`.
- Then 20 LIVE products (10 shoes in UK 6–11, 10 apparel in S–XL; mixed surplus and B-grade).
- Then 4 carts that lock stock exactly as the app does: "Office sneaker run" at 49,800, "Family school shoes" at 33,900, "Kandy weekend haul" (READY) and "Ravi's friends only" (PRIVATE).
- The e2e tests depend on these names and totals. Update `tests/e2e/journey.spec.ts` if you change them.

**Speed and cost:**

- Select only the fields a page needs.
- Avoid N+1 queries: use `include`/`select`, or `Promise.all` for independent reads.
- Keep the pool at `DATABASE_POOL_MAX` (default 10).
