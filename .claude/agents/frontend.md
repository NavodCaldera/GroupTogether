---
name: frontend
description: "Pages, components and styling for GroupTogether (speed-first, mobile-first). Use for anything under src/app (non-admin), src/components and globals.css."
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
- Shop filters are a plain GET form: one full-width box per row on phones, one wrapping row from `sm` up. With no search or filter the shop lists cheapest first; filtered results are newest first. Product images are lazy-loaded; when a product has no photo, show an emoji placeholder.

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

Map pin (rule 13): `src/components/location-picker.tsx` is the one client island for address + city + map pin (Leaflet from unpkg, loaded on demand; hidden `lat`/`lng` inputs). Used by sign-up, `JoinForm` on `/c/[code]` and `/account/location`. Keep it the only place Leaflet loads.

- Cart page `/c/[code]`: a buyer already in another cart sees "Ask to join and move my items here" (or "Request sent" with Cancel) instead of Join; the owner sees an "Asking to join" card with Accept and Decline.
  City field in the picker suggests places via Photon (photon.komoot.io, limited to Sri Lanka, debounced 300 ms) and flies the map to the best match; do not use Nominatim for type-ahead (its policy forbids it).

- `/carts` (Open carts): a plain GET search form (`q`), a hint line ("Nearest to your delivery point first" or a prompt to pin/sign in), and cards that show "N km away" when known.
  Cart page (rule 14): `delivery-map.tsx` (read-only Leaflet, exact only for members/admins; server rounds coordinates for others) and `chat.tsx` (polling island, 8 s, visible tab only).
  Home page lists the 8 cheapest live products, price ascending ("Affordable prices"), via `listProducts(f, take, "cheapest")`. Before that section, its own "How we solve the problem" section holds `WhyCheap`, which explains the price: "Bulk buying from factory surplus" → "Consumer group buying" (arrow → on desktop, ↓ on phones), then "On average X% below retail" from `retailSaving()` (null under 3 qualifying products → generic line). Markup only.

- `TaxonomyFields` (shop filter and admin product form): Category is disabled until an Audience is chosen, and Size until a Category is chosen; clearing the audience clears the category.
  Shop search is `components/search-box.tsx` (dropdown from `/api/suggest`, 200 ms debounce); the form still works as a plain GET.
  Every inner page (detail, new, pay, account) starts with `<BackLink fallback="<parent>" />` from `components/client.tsx`; header-level pages (home, shop, carts, my-carts, dashboard, notifications, admin/seller home and lists) do not.

- No cart-name field on Start a cart or the product page's new-cart option: carts are named after their owner.

- `CartCard` (open carts panel) is deliberately minimal: name, bar, "LKR N to go" or "Minimum reached", and a grey "distance · time left" line (amber under 2h). No status badge for OPEN, no city or member count.

- Cart page `/c/[code]` is kept deliberately light: title (badge only if not OPEN), one bar with "LKR N to go" + countdown, then ONE call to action in `StatusPanel`. Members are native `<details>` rows (open for your own row or a one-member cart); share is a single row; messages sit in a collapsed `<details>`. Never stack two alerts for the same decision.

- Cart page members: others show name + total only (no item lists); only the signed-in user's own row is a `<details>` with editable items.

- Cart page order (single centred column, max-w-2xl): title + "N people · distance", progress card ending in exactly one next step, owner's join requests, "In this cart" (totals; own row editable), messages directly under it, share row, delivery map, then leave/cancel as quiet text links. A blocked buyer always gets a way forward ("Go to your cart").

- Sharing a cart: `ShareMenu` (client island in `src/components/client.tsx`), an icon button beside the cart title that opens Copy link / Share on WhatsApp. No separate share box.

- `/messages`: inbox (list of conversations with avatar initial, name, time, unread badge; no cart line or last-message preview). In `ChatPanel` your own messages carry ticks after the time: one grey tick sent, two green (`text-accent`) ticks seen and the open conversation (`ChatPanel`). Two panes on desktop; on phones the list and the conversation take turns ("← All messages"). Header has a chat icon with the unread count beside the bell.

- Header links use `NavLink` (`src/components/nav-link.tsx`, a tiny client island with `usePathname`): the current section gets `aria-current=page` and a green underline (bottom tab: green text). Sections can claim extra prefixes via `also` (Shop: `/products/`, Carts: `/c/`).
`/dashboard` is one current-cart card plus up to 3 past orders. The sentence and button come from `nextStep(status, mine, …)` in `cart-rules.ts`; change wording there (with `dashboard-step.test.ts`), not in the page.
Colour rule (product owner, 2026-10-17): amber `text-warn` is used **only** for time left (countdowns, deadlines). Status badges use neutral/good/info/bad; there is no `warn` badge tone.
Invites (product owner, 2026-10-17): the cart page no longer shows the invite-by-email/phone form; people join via the share link/WhatsApp. `InviteForm` and `inviteAction` are unused.
Profile (2026-10-17): header profile icon → `/account` (`ProfileForm`: name, phone, `LocationPicker`; Sign out lives here). `/account/location` only redirects.
