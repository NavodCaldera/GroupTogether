---
name: catalogue-admin
description: "Products, variants/stock and the admin back office of GroupTogether (overview, carts, products, settings). Use for src/server/catalogue.ts, src/server/admin-actions.ts and src/app/admin/."
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

## Your area: catalogue and admin

**Files:**

- `src/server/catalogue.ts`
- `src/server/admin-actions.ts`
- `src/app/admin/**`, which includes `admin-form.tsx`, the generic `useActionState` form that shows `{ error | ok }`
- `src/app/api/photos/[id]/route.ts`

**Catalogue:**

- Products have a category (`SHOES` or `APPAREL`), a stock type (`FACTORY_SURPLUS` or `B_GRADE`), a price and an optional `retailPrice` (shown struck through), plus one photo (JPEG, PNG or WebP up to 5 MB, stored on local disk and served by `/api/photos/[id]` with an ETag).
- **B-grade requires `defectNotes`**, which the zod refine in `productSchema` enforces. They are shown up front.
- Only LIVE products are listed or can be added to carts. DRAFT is hidden and ARCHIVED is retired.
- Variants are size plus colour, for example "UK 9" for shoes or "M" for apparel.
- `adjustStock(product, size, colour, ±n)` creates the variant if it is missing and changes **free stock only** (`available`). It refuses to remove more than is free, so locked stock (`reserved`) and `sold` are never edited by hand.
- `listProducts` filters by category, stock type, brand, size (sizes with free stock) and search text. `shopFacets` supplies the brand and size dropdowns.

**Admin:**

- Every admin page and action calls `requireAdmin()`. The admin layout also guards the section.
- Pages:
  - Overview: tiles for slips to review, carts to dispatch, carts awaiting a slip, READY carts, open carts and low stock (≤ 2).
  - Slips, as described in the `payments-slips` agent.
  - Carts: filter chips by status, then a cart page with the picking list, timeline, slips, delivery booking or status, and cancel with a reason.
  - Products: free / in carts / sold counts.
  - Settings.
- Settings: `minOrderValue` (applies to **new** carts only; existing carts keep their snapshot), `cartLifetimeHours` (24), `slipWindowHours` (2), and the bank account details shown to owners.
- After an action removes its own form, redirect with a query flag and show an `Alert` banner. Otherwise the success message is lost.
- Admin accounts come only from the seed. Public sign-up creates customers only.
