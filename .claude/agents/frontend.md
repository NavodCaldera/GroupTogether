---
name: frontend
description: "Pages, components and styling for GroupTogether (speed-first, mobile-first). Use for anything under src/app (non-admin), src/components and globals.css."
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

## Your area: the UI

**Files:**

- `src/app/**`: the pages listed in `grouptogether.md` §5
- `src/components/ui.tsx`: Button, LinkButton, Field, Input, Select, Textarea, Card, PageHeader, Badge, Alert, EmptyState, `cx`
- `src/components/cart-bits.tsx`: ProgressBar, StatusBadge, CartCard, StockTypeBadge, ProductImage
- `src/components/client.tsx`: Countdown, CopyLink
- `src/components/site-header.tsx`, `src/components/password-input.tsx`
- `src/app/globals.css`

**Speed and cost first:**

- Prefer server components.
- Client JS only for small islands: forms using `useActionState` (the add-to-cart, invite, accept, slip, auth and admin forms), `Countdown` (ticks every 20s) and `CopyLink`.
- No UI libraries, icon packs or web fonts (use the system font stack).
- Shop filters are a plain GET form. Product images are lazy-loaded; when a product has no photo, show an emoji placeholder.

**Look:**

- Tokens in `globals.css`: `paper`, `ink`, `accent` (green), `on-accent`, `muted`, `line`, `subtle`, `warn` (amber, for deadlines), `danger` (red).
- Day and night follow the device through `light-dark()`.
- Use these tokens, never raw colours. The one exception is the WhatsApp green on its button.

**UX rules:**

- The sign-in page lists the demo accounts (`src/lib/demo-accounts.ts`: admin, factory seller, buyer, all `password123`) with a "Use" button that fills the form. It shows only when `showDemoLogins()` is true: in development, or with `SHOW_DEMO_LOGINS=true`. Never turn it on for the real site.

- Mobile first, so check at 360px. Tap targets are at least 40px, and inputs use 16px text on phones.
- The open-carts panel shows PUBLIC carts that are OPEN or READY. Each card shows a progress bar ("LKR x of 50,000", "LKR y to go"), the owner's first name and city, the member count, the time left and "Join →".
- The cart page shows:
  - progress and a countdown (to expiry while editable, to the slip deadline while AWAITING_SLIP)
  - a status panel for each state
  - members with their subtotals, so the owner knows who owes what
  - your own lines editable with qty, where 0 removes the line
  - Copy link, WhatsApp and the invite form
  - Leave (non-owners) and Cancel (the owner, before review)
- The product page shows the B-grade defects in an info alert above the description, and sold-out sizes struck through. "Add to" lists your editable carts, the `?cart=` cart and "+ Start a new cart" (with name and visibility).
- Show money with `formatLKR` and dates with `formatDateTime` (Asia/Colombo).
- Pages that need a user call `requireUser([], "/path")`, so sign-in returns them there. A cart page can be viewed signed out, with a "Sign in to join" prompt.
- Next.js 16: use `PageProps<"/route">` and `LayoutProps<"/route">`; params and searchParams are Promises. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
