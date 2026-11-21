---
name: frontend
description: "Shared pages, components, styling, role navigation and mobile interaction for GroupBasket. Domain specialists own behavior."
---

# Frontend

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Pages: `src/app/`; shared components: `src/components/`; design tokens: `src/app/globals.css`.
- Primitives: `ui.tsx`; navigation: `site-header.tsx`, `nav-link.tsx`.
- Forms and feedback: `client.tsx`, `toast.tsx`, `src/server/flash.ts`.
- Domain specialists own service invariants; consult them when rendering changes behavior.
- Policy references: `UX-001`/`UX-002`, `DATA-001`, `ORD-002`, `ORD-005`, `LOC-001`.

## Shared interface standards

- Any new external origin must be added to the CSP in `next.config.ts`.
- Fit heatmap (`DEC-020`): `three` is allowed only inside `src/components/fit/fit-viewer.tsx`, loaded lazily when the fit module scrolls into view; keep pixel ratio ≤ 1.5, no shadows. Card colours and the shader share `src/lib/fit/colour.ts`. The on-phone capture in `src/components/fit/capture/` is copied from `fit-lab/` (its CSS is scoped to `.fit-capture`); MediaPipe, OpenCV and DRACO are served from `public/` and need `'wasm-unsafe-eval'` and `blob:` workers in the CSP. The fit card's legend and _Guidance, not a guarantee_ are a `UX-001` exception.
- Material Card (`DEC-022`): `src/components/materials/`. Feel bars are drawings hidden from screen readers with an `sr-only` sentence each (`axisText`); never an `<input type="range">`. "How we know this" is a native `<details>`. The badge, "estimate", "Not yet measured" and that disclosure are the card's `UX-001` exception. Snapshot tests render with `react-dom/server` (`*.test.tsx` are in the unit project).

- Prefer server components and small interactive islands. System fonts, existing primitives and tokens; no new icon/UI/chart library without task justification.
- Read installed Next.js guides before framework code. Inspect current route typing and async params/searchParams conventions rather than copying remembered APIs.
- Check at 360 px. Tap targets are at least 40 px; phone inputs use 16 px text. Preserve keyboard interaction, labels and focus states.
- Use theme tokens and existing device light/dark behavior. Amber `text-warn` is for deadlines; status badges use existing neutral/good/info/bad tones.
- Screens use titles, data and actions without page-description or flow-explanation text. Show success through `flash()`/`FlashToast` or an existing mounted `Toast`; use inline `Alert` for errors.
- Starting another form submission dismisses the preceding global flash toast, so it cannot cover a new confirmation's action link. Preserve ordinary pointer interaction in browser verification; do not force clicks through overlays.
- Format money with `formatLKR` and dates with `formatDateTime` using Asia/Colombo. Display saved/configured thresholds, not fixed example amounts.
- Reuse `SuggestInput` for search suggestions, native GET filters, `FilterSelect` for long mobile chip rows, and mobile cards/desktop tables.
- Reuse chart tokens, focusable CSS tooltips and a ?Show as table? fallback. Factory price/quantity charts use two panels on a common day axis, not dual y-axes.
- Unexpected render errors fall to `src/app/error.tsx` (root layout failures: `global-error.tsx`). Never render `error.message` there. `/e2e-error` is a test-only fixture that 404s outside e2e builds.
- Inner/detail/form pages use the existing `BackLink` pattern. Navigation uses `NavLink` with appropriate `aria-current`.

## Role and journey boundaries

- `BackLink` (components/client.tsx) uses browser history only when `NavDepth` (root layout) has counted an in-app page behind this one; otherwise it opens its fallback, so Back never leaves the site.
- Product and compare pages call `requireUser` with `next` (2026-11-21); only Home and Shop are open to visitors.
- /orders has three tabs, Agent pickup / My baskets / Joined baskets (`groupOf`, `?tab=pickup|mine|joined`; /own-baskets redirects to `?tab=mine`), each grouped by stage with `groupByStage` (Filling, Packing, On the way, Delivered, Refunded; `orderStage` in src/lib/order-stage.ts; `DEC-026`). Cards (`OrderCard`) are stretched-link cards (Share above with `relative z-10`); `productsOf` counts sizes of one product as one ("+N more" = other products). The buyer home shows no orders (2026-11-21).
- The order page (src/app/orders/[id]/page.tsx): H1 is the stage; one card holds `OrderSteps` (tracker on `TRACK`, `dates` per reached stage, `fill` on Filling as role=progressbar "Basket progress"), the next line, owner actions by stage and the pickup code (`buyerOrder.pickup`, shared `readyPickups`); then the agent (open now, hours, Map) or the delivery (address to the owner only); then for own baskets the Buyers card from `basketPayments` (owner sees everyone's money and totals), otherwise Items + Payment. No Cancel anywhere; never repeat a fact (owner, 2026-11-21).
- The cart (src/app/cart/page.tsx, DEC-027): rows carry `sel` checkboxes linked by `form="cart-pick"` to a GET form (`sel`, `how`, `picked`); `cart-select.tsx` has `SelectAll` and `Choices` (Agent pickup, My basket, Join a basket; disabled with nothing ticked, the basket ways with mixed factories; the panel hides while the ticks differ from it). Panels: agents → GET /checkout?agentId&items; baskets → `ownFromCartAction`. `/own-baskets/new` redirects to the cart. `/own-baskets/[id]` only redirects a buyer in the basket to their newest order there, else 404 (DEC-028: no share links, `CopyLinkButton` removed); the cart's Join panel has Ask to join / Asked / Declined rows (`data-basket`) and the order page a Requests card (Accept/Decline); the payment return page links "Your order". Orders shows one card per own basket and stage (`oneCardPerBasket`, src/lib/order-merge.ts).
- `BackLink` falls back with `router.replace` (never a push), so fallbacks that point at each other cannot loop. Step trackers and fill bars use `StepTrack` / `FillBar` (src/components/step-track.tsx); own baskets use `OWN_STEPS` / `ownStep` from own-bits (2026-11-21).
- Shop has no Audience box (`DEC-025`): `TaxonomyFields` with `withSize` hides it and takes the buyer's audience from `audienceFor(user.gender, user.birthDate)`; `listProducts({ audience })` also returns unisex (null-audience) products.
- Signed-out visitors get no section links (top bar or tab bar) until they sign in (2026-11-21).
- Buyer home is `/` (`/dashboard` redirects there), with the phone tab bar Home, Shop, Orders, Tokens. Agents are buyers too: they keep the buyer bar and reach `/agent` sections through an in-page tab row, not a second bottom bar (open, `DEC-016`). Factories use `/seller`; admins their area home. Backend role guards remain required, and agent pages also gate on `Agent.status`.
- Theme (2026-11-04): light (white) is the default; dark only when the `gt_theme` cookie says so (`data-theme="dark"` on `<html>`). Keep colours as `light-dark()` tokens in `globals.css`; never use `prefers-color-scheme`.
- Factory pages use `FactoryShell` with the login's `factoryRole`: it shows only that job's sections (`src/lib/factory-roles.ts`) as a bottom tab bar on phones and top tabs from `sm` up (2026-11-04). Hide rupee figures unless `seesMoney(role)`. Guard factory pages and actions with `requireFactory(section)` and use its `factoryId`, never the login id, for factory data.
- The signed-out home leads with the factory-to-you hero (`DEC-024`): headline, the looping middlemen-to-dust chain (`hero-replay.tsx` remounts it each cycle, 3 plays, held while hovered or focused so focus is never lost; no pause button by owner choice; `fc-*` in globals.css, reduced motion shows the end), the top deal's price drop (`price-drop.tsx`) and Shop and save; its product row is "Biggest savings" (`listProducts` order `"saving"`, `savingPercent` badge). Prove saving with numbers and struck prices, never "cheap" wording or explainer text.
- Each home shows its most important item first (`UX-002`). Checkout shows Item, Tokens, PayHere fee and Total, then Agent and courier fee at pickup, then Pay; the agent's hand-over form shows the fee with a required Fee received tick; the return page shows Checking until the verified notice arrives. Pickup cards show the code, agent, open now or closed, hours and a map link.
- Profile (`/account`) has Details and Address cards; tokens are only on `/tokens`.
- My measurements (`/account/fit`) has About you and Measurements cards; fields keep "(cm)" in
  their accessible names for tests and screen readers while showing a "cm" suffix. Its body guide is pre-rendered
  ([tools/body-guide](../../tools/body-guide/README.md)); regenerate it rather than hand-editing
  `src/lib/fit/body-guide.json`.
- Profile location uses `LocationPicker`, the single on-demand map island. Keep map stacking isolated. City lookup is debounced; preserve the configured provider usage rather than switching services casually.
- Ordinary catalogue UI uses apparel scope and free stock; do not restore product-status, condition or defect controls. Brand rewards remain separate from paid shop listings.
- Factory dashboards show own design aggregates/shop prices. Brand dashboards show own gift products, paid orders, settlements and Messages. Unpaid reservations expose aggregate counts only.
- Brand review/history/context use shared `Brand*` components and `GiftProductDetails`. Keep internal notes admin-only and partner pricing private. Preserve drafts during visible-tab refresh; read markers follow visible messages, not GET/prefetch.
- Brand product forms retain photos unless replaced, preserve required gift details/optional expiry metadata and omit delivery-charge fields.
- Factory Packing UI hides money. The shared primary `Button` must pass 4.5:1 contrast in both themes.
- Demo logins are governed by `showDemoLogins()` and development/`SHOW_DEMO_LOGINS`; never enable them for a real deployment as part of unrelated UI work.

## Verification and coordination

Use `.agents/skills/groupbasket-browser-review/` and selected Vercel skills alongside these standards. `tests/e2e/accessibility.spec.ts` checks public pages and role workspaces with axe and overflow assertions on desktop and at 360 px. Preserve manual keyboard and usability review. The pinned interactive browser CLI is available through `npm run browser -- --help`.

Check affected mobile/desktop layouts, theme contrast, keyboard behavior, role boundaries,
success after redirects and drafts during refresh. Use the role journeys in
`tests/e2e/buyer.spec.ts`, `agent.spec.ts`, `factory.spec.ts` and `admin-workspaces.spec.ts` when flows change.
The standalone [fit lab](../../fit-lab/README.md) is an experiment, not implemented main-app
personalization. Follow [qa-review](qa-review.md) and the relevant domain specialist.
