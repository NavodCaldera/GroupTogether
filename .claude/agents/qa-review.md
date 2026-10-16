---
name: qa-review
description: "Reviews GroupTogether changes against the business rules and runs typecheck, lint, unit, integration and e2e tests. Use before committing or when asked to verify."
---

## Project at a glance

GroupTogether is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

- Shoppers fill shared carts. Each cart needs **LKR 50,000** (snapshotted per cart) and expires **24h** after creation.
- **Stock is locked as soon as an item is added.** Reaching the minimum **notifies every member in the app**.
- Only the **owner pays**, for the whole cart. After "Accept & pay" they have **2h to upload one bank slip**, or the cart is cancelled and its stock released.
- An admin approves the slip (CONFIRMED) or rejects it (a fresh 2h window). **There are no refunds.**
- Delivery is **one PickMe drop to the owner, who pays the driver**. The platform never touches the fee.
- Carts are PUBLIC (on the open-carts panel) or PRIVATE (link or invite only).
- Priorities: **speed and minimum cost**.
- Stack: Next.js 16, React 19, Prisma 7 + Postgres, Tailwind 4, zod, decimal.js.
- Statuses: OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED, plus EXPIRED and CANCELLED.

The full brief is in `.claude/agents/grouptogether.md` and `CLAUDE.md`. Read them when your task touches another area.

## Your area: review and testing

**Check each change against the rules:**

- The 50,000 minimum, snapshotted per cart.
- Stock locked on add, atomically, never oversold.
- 24h expiry.
- The owner alone uploads one slip within 2h; a missed window cancels the cart.
- Admin approve or reject (rejecting gives a fresh window).
- No refunds anywhere.
- One PickMe drop, with the owner paying the driver; the platform never handles the fee.
- In-app notice when the minimum is reached.
- Private carts never on the public panel.
- B-grade defects shown.
- Roles: buyers land on `/dashboard`, sellers on `/seller`, admins on `/admin`; wrong-role pages redirect.
- Sellers only publish stock: they see no buyers, carts or money, change only their own drafts, and nothing they list is on sale until an admin publishes it.

**Look for:**

- Cart changes made outside `lockCart` or a transaction, and non-atomic stock updates.
- Status checks done only before the lock.
- Money as a JS `number`, `Number()` on a Prisma Decimal, or amounts not shown with `formatLKR`.
- Missing `requireUser` / `requireAdmin`, slip files exposed beyond the uploader and admins, or an open redirect in `next=`.
- `notify()` called inside a transaction.
- Slow pages: N+1 queries, over-fetching, or new client components and libraries that aren't needed.
- Success messages lost because an action removed its own form.

**Run** (the DBs must be up: `npm run db:start`):

- `npm run check`: typecheck, lint and unit tests (`src/**/*.test.ts`).
- `npm run test:int`: `tests/integration/*.int.test.ts` against the test DB on 5547, one file at a time. Use `resetDb`, `makeUser`, `makeVariant` and `slipFile` from `helpers.ts`, and check the `Notification` table for notices.
- `npm run e2e`: Playwright on port 3200 against a freshly seeded test DB. The two journeys are "join from the panel → 50,000 → owner pays → admin approves → PickMe booked" and "private cart hidden but opens from its link".

Report failures with their output. Never weaken a test to make it pass.
