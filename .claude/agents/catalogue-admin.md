---
name: catalogue-admin
description: "Products, variants/stock and the admin back office of GroupTogether (overview, carts, products, settings). Use for src/server/catalogue.ts, src/server/admin-actions.ts and src/app/admin/."
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

## Your area: catalogue and admin

**Files:**

- `src/server/catalogue.ts`
- `src/server/admin-actions.ts`
- `src/server/admin-queries.ts`
- `src/app/admin/**`, which includes `admin-form.tsx`, the generic `useActionState` form that shows `{ error | ok }`
- `src/app/api/photos/[id]/route.ts`

**Catalogue:**

- Products have a category (`SHOES` or `APPAREL`), a stock type (`FACTORY_SURPLUS` or `B_GRADE`), a price and an optional `retailPrice` (shown struck through; `retailSaving()` turns the live ones into the home page's "On average X% below retail", needing at least 3 products priced under retail), plus one photo (JPEG, PNG or WebP up to 5 MB, stored on local disk and served by `/api/photos/[id]` with an ETag).
- **B-grade requires `defectNotes`**, which the zod refine in `productSchema` enforces. They are shown up front.
- Only LIVE products are listed or can be added to carts. DRAFT is hidden and ARCHIVED is retired.
- Variants are size plus colour, for example "UK 9" for shoes or "M" for apparel.
- `adjustStock(product, size, colour, ±n)` creates the variant if it is missing and changes **free stock only** (`available`). It refuses to remove more than is free, so locked stock (`reserved`) and `sold` are never edited by hand.
- `listProducts` filters by category, stock type, brand, size (sizes with free stock) and search text. `shopFacets` supplies the brand and size dropdowns.

**Admin:**

- Every admin page and action calls `requireAdmin()`. The admin layout also guards the section.
- Pages (shared list pieces such as chips, search, pager and table are in `src/app/admin/list-bits.tsx`; filters are plain GET links, no client JS):
  - Layout nav with red count badges: slips to review and confirmed carts to book.
  - Overview (`src/server/admin-queries.ts` → `overviewStats`): needs-action tiles; confirmed sales today, last 7 and last 30 days (Colombo days, by `confirmedAt`, statuses in `PAID`) and the average order; value locked in unpaid carts; slip windows running and carts expiring within 6h; low stock (≤ `LOW_STOCK`); best sellers by units sold; recent orders; CSV export.
  - Slips, as described in the `payments-slips` agent, plus a "Reviewed" tab (`?view=history`, the last 100 with reviewer and note).
  - Carts: search (code, name, owner name, email or mobile), status chips with counts, a due column (expiry or slip window), 50 per page. The cart page has the picking list, **members and their shares** (what each owes the owner), timeline, slips, delivery booking or status, and cancel with a reason.
  - Deliveries: confirmed carts to book (oldest first), drops in progress with status buttons, recently delivered.
  - Products: search, status chips, and "low stock" (live products with a size at ≤ 2 free); free / in carts / sold counts.
  - Users: search and filter (customers, admins, locked). A user's page shows their carts with their share, slips, active devices, and **lock / unlock**. `setUserLocked` refuses admins, and locking deletes every session, so the user is signed out at once. Their carts are left alone; an admin cancels them separately if needed.
  - Settings, plus a system card (delivery provider, cron, `APP_URL`, uploads folder).
  - `GET /admin/export/orders?days=30`: confirmed orders as CSV (UTF-8 BOM for Excel). `toCsv` prefixes cells that start with `= + - @` so they can't run as formulas.
- Admin controls stay inside the business rules. There is no override of the 24h / 2h deadlines, no admin editing of members' lines and no refunds. Ask the product owner before adding any of these.
- Settings: `minOrderValue` (applies to **new** carts only; existing carts keep their snapshot), `cartLifetimeHours` (24), `slipWindowHours` (2), and the bank account details shown to owners.
- After an action removes its own form, redirect with a query flag and show an `Alert` banner. Otherwise the success message is lost.
- Admin accounts come only from the seed. Public sign-up creates buyers (`CUSTOMER`) only. Factory sellers (`SELLER`) are created at `/admin/users/new-seller` (`createSeller`).
- **Seller products** (`src/server/seller.ts`; product-owner rule, 2026-10-16):
  - `Product.sellerId` is null for our own listings. `ProductStatus` has `IN_REVIEW` between DRAFT and LIVE.
  - The seller creates a draft, adds stock by size, and submits it (it needs free stock; B-grade needs defects). The admins get an in-app notice.
  - The admin product page shows a review card: **Publish** (`IN_REVIEW → LIVE`, once the stock has reached our store) or **Return to seller** with a note (`→ DRAFT`, `reviewNote`). The seller is notified in the app either way.
  - Sellers change details and stock only on their own drafts. `saveProduct(..., sellerId)` re-checks `status: DRAFT` in the same update, and the transitions use guarded `updateMany`. Live products are managed by the admin, since we hold the stock.
  - Sellers never see buyers, carts or money. Their dashboard `/seller` shows their products, statuses and stock counts only.
  - `ProductForm` takes `action` and `seller` (no status field for sellers). `StockTable` (`src/components/stock-table.tsx`) and `ProductStatusBadge` (`cart-bits.tsx`) are shared by admin and seller pages.
    `suggestProducts` in catalogue.ts feeds the public `/api/suggest` (LIVE products only, title/brand match, max 6).
