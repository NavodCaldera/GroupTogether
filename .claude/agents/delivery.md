---
name: delivery
description: "PickMe delivery for GroupBasket: one drop per confirmed cart to the owner, the owner pays the driver, manual vs PickMe provider, webhook. Use for src/server/delivery/, /api/webhooks/pickme and the admin booking form."
---

## Project at a glance

GroupBasket is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

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

## Your area: delivery (PickMe)

**Files:**

- `src/server/delivery/provider.ts` (`DeliveryProvider`, `ManualProvider`, `PickMeProvider`, `deliveryProvider()`)
- `src/server/delivery/index.ts` (`bookDelivery`, `setDeliveryStatus`)
- `src/app/api/webhooks/pickme/route.ts`
- `bookDeliveryAction` and `deliveryStatusAction` in `src/server/admin-actions.ts`
- the booking form on `/admin/carts/[code]`

**Rules:**

- **One PickMe drop per CONFIRMED cart, to the cart owner**, at the drop-off address, city and phone they gave when accepting (falling back to their profile).
- **The receiver (the owner) pays the driver directly.** The platform never charges, collects or refunds a delivery fee.
  - `Delivery.paidBy` is always `"OWNER"`.
  - `quotedFee` is only shown to the owner, in their "on the way" notice and on the cart page.
- Members settle their share of the fee with the owner outside the platform.
- `bookDelivery` needs status CONFIRMED and no existing Delivery. It creates the Delivery, moves the cart to DISPATCHED and notifies the owner.
- `setDeliveryStatus(id, DELIVERED)` moves the cart to DELIVERED. It can be called from the admin buttons (picked up, delivered, failed) or the webhook.
- The **cart owner** can also mark the drop delivered from `/dashboard` (product owner, 2026-10-18): `markReceived(userId, cartId)` in `src/server/delivery/index.ts`, under the cart row lock. Only the owner, only while DISPATCHED with the delivery BOOKED or PICKED_UP (not FAILED); a repeat press is a no-op. Other members get an in-app notice to collect their items from the owner. The dashboard button ("Mark as delivered" → "Yes, I've received it") is shown when `nextStep(...).received` is set.
- After booking, the action redirects to `/admin/carts/<code>?booked=1`, because the form disappears.

**Providers:**

- `DELIVERY_PROVIDER=manual` (the default): the admin books the trip in the PickMe business app and types the ref, fee, tracking link and driver into the form.
- `DELIVERY_PROVIDER=pickme`: needs `PICKME_API_URL`, `PICKME_API_KEY` and `PICKME_MERCHANT_ID`.
  - **PickMe has no public API.** The request body in `PickMeProvider.book` and the webhook payload `{ id | reference, status }` are **ASSUMED** placeholders.
  - Replace them with the real fields once the PickMe business (Flash) docs arrive. Keep `collect_from: receiver`.
- The webhook is verified with HMAC-SHA256 of the raw body in `x-signature`, using `PICKME_WEBHOOK_SECRET`. It refuses everything while the secret is unset or `CHANGE_ME`.
- External calls get a 15s timeout. Never block a page on PickMe.

The owner's map pin is stored on the cart as `deliveryLat/deliveryLng` (rule 13); the admin cart page links to it with `mapsLink`. A real PickMe request should send these coordinates once the API shape is known.
The drop-off address/phone come from the owner's profile at accept time (`/account` to change).

**Packing before the drop** (product owner, 2026-10-18, CLAUDE.md rule 17): one packer checks and gathers each paid order, a different one rechecks and packs it (2026-10-19, `src/server/packing.ts`). `handOver` is only allowed once the order is packed **and** booked (Delivery BOOKED or PICKED_UP); it records who handed it over and moves BOOKED → PICKED_UP, then tells the owner "Your order is with the PickMe driver". `bookDelivery` notifies every packer ("PickMe booked"). The deliveries page and the admin cart page show `packingSummary` / `PackingTrail` (who gathered, who packed, who handed over). The admin's own "Mark picked up" button stays as an override.

**Tracking link is optional** (product owner, 2026-10-20): the booking form (on the order's card in Admin → Orders since 2026-10-21) labels it "Tracking link (optional)"; empty books fine (`trackingUrl` null, no "Track delivery" for the owner). A typed value must be a full URL (`type="url"`).

**No "Mark picked up" after a handover** (product owner, 2026-10-20): when `Packing.handedOverAt` is set (the packer's handover moves the drop to PICKED_UP), the admin cart page and `/admin/deliveries` don't show "Mark picked up"; the cart page also hides it while the drop is PICKED_UP. "Mark delivered" / "Delivery failed" remain.

**Admin → Orders is the only delivery workspace** (product owner, 2026-10-21, CLAUDE.md rule 19). `/admin/orders` (`ordersBoard`, `orderStage`) lists every paid order: To book (form on the card: PickMe booking ref, Fee (LKR), Tracking link (optional), Driver name → "Mark as booked"), In store, On the way (**Delivered** / **Failed**), Failed (**Book again**, **Delivered**), Delivered (last 20). The cart page and the Carts list have no delivery buttons; `/admin/deliveries` and `/admin/packing` redirect to Orders. **Book again**: `bookDelivery` also accepts a DISPATCHED cart whose drop is FAILED/CANCELLED; it updates the same `Delivery` (new details, status BOOKED) and clears `Packing.handedOverAt/By` so the packers hand it over again; owner and packers are told as on a first booking.
