---
name: payments-slips
description: "Bank-slip payment flow in GroupBasket: the owner's single slip upload within 2h, admin approve/reject, slip file access, bank details. Use for src/server/carts/slips.ts, /c/[code]/pay, /admin/slips and /api/slips."
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

## Your area: payment by bank slip

There is no card gateway. Payment is a bank transfer only.

**Files:**

- `src/server/carts/slips.ts`
- `src/app/c/[code]/pay/page.tsx`
- `SlipForm` in `src/app/c/[code]/cart-forms.tsx`
- `src/app/admin/slips/page.tsx` (the review queue) and `slip-decision.tsx` (approve / reject island)
- `src/app/api/slips/[id]/route.ts`
- `approveSlipAction` and `rejectSlipAction` in `src/server/admin-actions.ts`

**Admin review page (`/admin/slips`):**

- Pending slips, oldest first, each with how long it has waited (`waitedFor`). `?slip=<id>` opens one; on desktop (`lg`) the oldest opens by itself beside the queue, on phones the queue and the slip are separate screens ("← All slips").
- The open slip shows the image inline (tap for full size); a PDF is a tile that opens it in a new tab, because the route's sandbox CSP stops Chrome showing PDFs inside a page.
- "Check these on the bank account": amount, cart code as the reference (copy button), our account from Settings (or a link to set it up), upload time. Then the owner (tap-to-call phone), the cart link with its member count, and any earlier rejected slips for the cart with their reasons.
- The decision bar is docked at the bottom of the screen on phones and inline from `lg`.
- With nothing to review: "No slips waiting" and "Expected soon" (AWAITING_SLIP carts with a countdown to `slipDueAt`).

**Rules:**

- Only the **cart owner** pays, for the **whole cart total**, with **one slip**: JPEG, PNG, WebP or PDF, up to 5 MB, checked by `checkUpload(file, SLIP_TYPES)`.
- Upload is allowed only in AWAITING_SLIP and before `slipDueAt`.
  - Check before storing the file, and again under the cart lock.
  - Then create the `PaymentSlip` (amount = cart total, status PENDING) and move the cart to SLIP_REVIEW. This stops the timer.
  - Every admin gets an in-app notice.
- **Approve** (admin):
  - Slip APPROVED, cart CONFIRMED with `confirmedAt` set.
  - For every line: `reserved -= qty` and `sold += qty`.
  - Members are notified in the app.
  - The admin confirms in two taps ("Approve…" → "Yes, approve"), because approving can't be undone.
  - The action redirects to `/admin/slips?done=approved&cart=<code>`: a pop-up, then "Book the PickMe delivery" (the cart page) and "Next slip →".
- **Reject** (admin, a reason of at least 3 characters):
  - Slip REJECTED with `reviewNote`, cart back to AWAITING_SLIP with a **fresh** `slipDueAt = now + slipWindowHours`.
  - The owner gets an in-app notice asking them to re-upload. The pay page and the cart page show the rejection reason.
  - The reason field suggests common reasons (a `datalist`, any text allowed). The action redirects to `/admin/slips?done=rejected&cart=<code>`.
- A slip that is already reviewed can't be reviewed again ("already been reviewed").
- The owner can't cancel during SLIP_REVIEW; an admin can.
- **There are no refunds.**
- Bank details (bankName, bankBranch, accountName, accountNumber) come from `Settings`.
  - The pay page shows them with the amount and the cart code as the transfer reference.
  - If the account number is empty, it shows a "not set up" message instead.
- Slip files are private.
  - `/api/slips/[id]` serves them only to the uploader or an admin, with `Cache-Control: no-store` and a sandbox CSP.
  - Files are stored under `slips/<cartId>/` in `STORAGE_DIR`.

**Tests:** the integration file covers upload → approve → stock sold, reject → fresh window, a missed window → cancelled, and an owner cancelling during review being refused.
