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

- Buyer home is `/` (`/dashboard` redirects there), with the phone tab bar Home, Shop, Orders, Tokens. Agents are buyers too: they keep the buyer bar and reach `/agent` sections through an in-page tab row, not a second bottom bar (open, `DEC-016`). Factories use `/seller`; admins their area home. Backend role guards remain required, and agent pages also gate on `Agent.status`.
- Theme (2026-11-04): light (white) is the default; dark only when the `gt_theme` cookie says so (`data-theme="dark"` on `<html>`). Keep colours as `light-dark()` tokens in `globals.css`; never use `prefers-color-scheme`.
- Factory pages use `FactoryShell` with the login's `factoryRole`: it shows only that job's sections (`src/lib/factory-roles.ts`) as a bottom tab bar on phones and top tabs from `sm` up (2026-11-04). Hide rupee figures unless `seesMoney(role)`. Guard factory pages and actions with `requireFactory(section)` and use its `factoryId`, never the login id, for factory data.
- Each home shows its most important item first (`UX-002`). Checkout shows Item, Agent fee, Tokens, PayHere fee and Total, then Pay; the return page shows Checking until the verified notice arrives. Pickup cards show the code, agent, open now or closed, hours and a map link.
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
