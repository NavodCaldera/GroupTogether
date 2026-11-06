---
title: "Factory admin and factory role dashboards rebuild"
status: draft
created: 2026-11-06
updated: 2026-11-07
---

# Factory admin and factory role dashboards rebuild

**Draft.** Packing is agreed. Planner, Sales, Owner and Factory admin still need their interview.

## Why this rebuild

Factory dashboards have the wrong focus, are missing features, are weak on a phone, and the factory
admin page still reflects the old stock-buying model. All staff share one Home, so people see blocks
they can't act on, and admins see offers and warehouse receipts instead of today's factory work.

## Who it serves

- **Factory staff:** Packing, Planner, Sales and Owner, each with their own Home at `/seller`.
- **Factory admins:** the people overseeing factories at `/admin/factory`.

**Rule for every screen:** the top spot is the next thing that person can act on, never a figure or
chart. Every item's placement must be justified.

## What each dashboard contains

### Factory admin

Not yet interviewed.

### Owner

Not yet interviewed.

### Packing

Approved by the owner on 2026-11-06.

**Home layout, in order:**

1. **Driver booked** strip, with the waiting parcel's driver details.
2. **Next to pack**, oldest paid first, with Start packing.
3. Counts.

The full list is on the Orders tab, where staff can pick any order.

**Packing an order:**

- **Checklist:** one row per product, colour and size. Mark packed unlocks when all rows are ticked.
  Ticks are saved on the server so a colleague can continue. A tick isn't proof and doesn't affect
  return fault.
- **Report a problem:** missing or damaged, with a note. FACTORY admins are notified, and Mark packed
  is blocked until it's cleared. It isn't a fault, doesn't change the cart and doesn't notify the
  buyer.
- **Photo:** required, showing the open parcel contents, before Mark packed. Only that factory's
  Owner and Packing staff and FACTORY/CORE admins can see it. It's evidence only and never decides
  fault. It needs durable storage (`DEC-008`) before launch.
- **Packing slip:** an optional print page with order code, items and city, with no prices or buyer
  details, plus a large on-screen code. Printing never blocks Mark packed.

**After packing:**

- **Booking:** admin books PickMe (`FUL-001` unchanged). There's no Small, Medium or Large choice and
  no Packing booking.
- **Driver details:** admin enters the required PickMe reference, driver name, phone and vehicle
  number (a new field), and puts the order code in the booking note where possible. Admin updates
  these if the driver changes.
- **Given to driver:** Packing or Owner records `PICKED_UP`, only after admin has booked. The
  confirmation names the order and vehicle, and the time and person are recorded. Admin can also
  record it. Delivered and failed stay admin-only.
- **Parcel is back:** after a failed drop, Packing records this with time and person, and WAREHOUSE
  admins are notified. Admin can rebook at any time.
- **Tracking:** a link only, with no expected arrival time.

**Packing never sees:** money, sales charts, buyer details, returns or booking controls.

### Planner

Not yet interviewed. Design drafts, likes and sew decisions are paused with preorders (`DEC-015`).

### Sales

Not yet interviewed.

## DEC-012 parts in or out

| Part | Status |
|---|---|
| Checklists | In, agreed under Packing |
| Design drafts | Paused with preorders (`DEC-015`) |
| Factory payouts | Not decided |
| Inbox and chat | Not decided |

## Owner protection

Not decided. Today a staff Owner can lock or demote another staff Owner. Only the main factory
account is protected, and nobody can lock their own login.

## Kept as they are

- `/seller/returns` and `/admin/factory/quality` keep their behaviour.
- All approved rules stay unchanged, except the Packing corrections above.
- Luxury brands keep their own dashboard at `/seller`.

## Not in this rebuild

Preorders are **not completed** and are paused until the owner resumes them. That includes deposits,
the Preorder basket, many baskets, the 3-day basket lifetime and preorder factory payments. See
`DEC-015` and [parked notes](preorder-parked-notes.md).

## Open questions

1. Who clears a reported problem? Assumed factory Owner or FACTORY admin; the owner hasn't confirmed.
2. How do staff close an order when an item can't be replaced? No cancel path exists today.
3. Can PickMe drivers see a booking note? Unverified. Matching still works on vehicle and reference.
4. Payout sum: the dashboard spec's "sale minus LKR 100" was replaced by `DEC-013` (factory price
   plus commission).
5. Only owners see money, yet Sales and Planner can edit prices. What should they see?
6. Lost-parcel responsibility stays open under `DEC-010`.
