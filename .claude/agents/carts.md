---
name: carts
description: "Group-cart lifecycle in GroupTogether: create/join/leave, stock locking, the OPEN/READY threshold, accept & pay, cancel, the 24h/2h deadlines (sweep) and invites. Use for src/lib/cart-rules.ts and src/server/carts/service.ts, invites.ts, queries.ts and actions.ts."
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

## Your area: shared carts

**Files:**

- `src/lib/cart-rules.ts` (pure, with unit tests in `cart-rules.test.ts`)
- `src/server/carts/service.ts`
- `src/server/carts/invites.ts`
- `src/server/carts/queries.ts`
- `src/server/carts/actions.ts`
- tests: `tests/integration/carts.int.test.ts`

**Invariants (never break them):**

1. **Every cart change happens under the cart row lock**: `db.$transaction` plus `lockCart()`, which runs `SELECT … FOR UPDATE`. Re-check the status inside the lock.
2. **Stock locks on add.** `setLine` changes the stock by the difference between the old and new quantity.
   - Increase: `variant.updateMany({ where: { id, available: { gte: delta }, product: { status: "LIVE" } }, data: { available: -delta, reserved: +delta } })`. If the count is 0, throw "Only N more available" or "sold out".
   - Decrease: release the difference.
3. Only OPEN and READY carts are editable, and only before `expiresAt`. Adding to a cart joins it (`cartMember` upsert). `setLine(..., { add: true })` adds to the existing quantity (at most 99).
   3b. **One cart at a time:** `createCart`, `joinCart` and `setLine` call `assertOneCart` (per-user advisory lock) and refuse when the buyer is already in another active cart (`isActiveCart` / `activeCartOf`). It also refuses anyone who isn't a buyer (`CUSTOMER`): sellers, packing staff and admins never use carts ("Only shoppers can use carts", product owner 2026-10-19).
   3c. **Merge requests (rule 13):** `requestMerge` (buyer in an active cart asks to join another; checked with `mergeBlockReason`; one pending per buyer by a partial unique index), `acceptMerge` (target owner only; locks both carts in id order; moves the lines without touching stock, adds the member, deletes the old cart or removes the member from it, recomputes both, notifies), `declineMerge`, `cancelMerge`. Table `CartMergeRequest` (`PENDING|ACCEPTED|DECLINED|CANCELLED`).
   3d. **Open carts order (rule 14):** `recentCarts(take, now, userId, { q, near })` filters public OPEN/READY carts the user isn't in, searches name/code/owner name, and with `near` (the buyer's pin) sorts by `distanceKm` to the cart's `deliveryLat/Lng` or else the owner's pin; unknown pins last. Pure helpers in `src/lib/distance.ts`.
   3e. **Cart name (rule 15):** `createCart` names a cart `"<owner name>'s cart"`; there is no name input in the UI.
4. After any line change, `recompute()` sums the lines into `total` and applies `statusAfterChange`. When the cart becomes READY, `notify(members, readyNotice)` runs **after** the commit.
5. `acceptAndPay(owner)` is owner only. It needs READY with total ≥ min, stores the drop-off details (zod `acceptSchema`; the phone must be `07XXXXXXXX`), and sets `slipDueAt = now + slipWindowHours`.
6. Cancelling:
   - The owner can cancel in OPEN, READY or AWAITING_SLIP.
   - An admin can cancel in any of the CANCELLABLE states (those plus SLIP_REVIEW).
   - `close()` releases the stock and keeps the lines.
7. `sweep(now, cartId?)`:
   - Expires OPEN and READY carts past `expiresAt`.
   - Cancels AWAITING_SLIP carts past `slipDueAt`.
   - Re-checks with `overdue()` under the lock, then notifies the members .
   - It runs from `/api/cron/sweep` and at the top of `/`, `/carts`, `/admin`, `/c/[code]` and the pay page.
8. Invites: the inviter must be a member, the cart must be editable, and the target must be a registered user found by email or phone. The invite row is upserted and the target is notified and emailed.
9. **There are no refunds.** Never add a refund path.

**Queries:**

- `recentCarts` (the panel): PUBLIC, OPEN or READY, not expired, newest first.
- `joinableCart(code)` lets a product page reached through `?cart=` add to a cart the user hasn't joined yet.
- `editableCartsFor(user)` fills the product page's "Add to" list.

**Tests:**

- Add every new transition to `cart-rules.ts` with unit tests, and to the integration file.
- Pass a `now` argument instead of mocking the clock.

Member location (rule 13): `joinCart(userId, cartId, location?)` stores address, city and map pin on `CartMember` and the profile; `createCart` and the implicit join in `setLine` copy the profile pin; `acceptAndPay` copies the owner's pin to `GroupCart.deliveryLat/deliveryLng`. Actions (`joinAction`, add-to-cart, create) require the pin; no pin sends the buyer to `/account/location`.
Owner chat (rule 14): `src/server/carts/chat.ts` (`sendMessage`, `listMessages`, `threadsFor`), `GET /api/chat`. A thread is keyed by (cart, participant); the owner replies but cannot start one, except with someone who has a PENDING request to join their cart (`askingToJoin`; the "Message" button on the "Asking to join" card opens an empty thread via `newThreadWith`, product owner 2026-10-17). Once started, the thread carries on after the request is decided.
Dashboard next step per status/role: `nextStep` and `journeyStep` in `src/lib/cart-rules.ts` (unit tests in `dashboard-step.test.ts`). An OPEN cart's button is "View cart" → `/c/<code>` (adding items happens from the cart page).
Invites (product owner, 2026-10-17): the cart page no longer shows the invite-by-email/phone form; people join via the share link/WhatsApp. `InviteForm` and `inviteAction` are unused.
Accept & pay takes the drop-off from the owner's profile (address, city, phone) in `acceptAction`; there are no address fields on the cart page. Missing profile data → error pointing to the profile.
