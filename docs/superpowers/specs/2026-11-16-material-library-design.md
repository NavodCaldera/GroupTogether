# Material Library and Material Card — implementation plan

## Context

Buyers cannot touch fabric online. The owner's spec asks for a curated **Material Library**
(fabric-level properties, picked by factories per product) and a buyer **Material Card**
whose every value traces to a lab measurement, a published source, or a versioned
GroupBasket rule. Anything without one of these is stored as null and shown as
"Not yet measured". A check must fail when a seeded or displayed value has no provenance.

What exists today (found in the repo):

- `Product` already has loose fabric columns from `DEC-020`: `gsm`, `weave`,
  `fabricStretchPct`, `thermalMinC/MaxC`, `breathability` (1–5), `careNotes`
  (`prisma/schema.prisma` ~L197–212), entered in `src/components/fit-data-form.tsx` and
  approved by a Factory admin.
- The product page already shows a `MaterialPanel`
  (`src/app/products/[id]/fit-section.tsx` L86–112) with "Comfortable X–Y°C" and
  "Breathability n of 5" — exactly the unsourced claims the spec forbids.
- No wizard: factory product editing is stacked cards on `/seller/products/[id]`.
- No REST API style: pages call `src/server/*.ts` query functions; changes are server actions.
- Uploads accept only JPEG/PNG/WebP up to 5 MB (`src/server/storage/index.ts`).
- `npm run db:seed` truncates every table, so it cannot be the library loader.
- `UX-001` bans explanatory screen text; no slider, popover or snapshot-test convention exists.

## Calls I made (correct any of these before approving)

1. **The new card replaces `MaterialPanel`.** The temperature range and "Breathability n of 5"
   stop being shown and are removed from the factory form. Columns stay in the database,
   unused, and are dropped in a later migration.
2. **One home for gsm.** The shell `ProductMaterial.actualGsm` is the source; the service
   mirrors it into `Product.gsm` so the fit heatmap and cloth-sim plan keep working.
   `fabricStretchPct`, size chart and care notes stay on the Fit data card. A gsm change
   still clears `fitApprovedAt`, as today.
3. **No approval gate on the material choice** (follows spec §8 and `SUP-002`): it shows at
   once; gsm or composition more than 15% outside the library range needs a confirm tick
   and lands in a Factory admin review list.
4. **Factory admin area (`FACTORY`) owns the library admin pages**, under a new Materials tab.
5. **Spec §10 "API" becomes server query functions and actions**, not REST routes. Only
   file serving gets route handlers.
6. **Estimated bands need a declared rule, or they are guesses.** The sources only give
   relative orderings ("modal softer than cotton"), not numbers. I will write versioned
   rules (`SOFT_EST_v1`, `SURFACE_EST_v1`, `BREATH_EST_v1`): a base band per construction
   class, shifted by fibre, yarn and finish steps, each table row citing evidence codes; a
   row without evidence makes the axis `not_available`. The band numbers are a GroupBasket
   product decision, stated openly in the rule text like the 80–400 gsm range. **All 33
   materials stay `draft` and invisible to buyers until you review the rule tables and
   publish them in admin.**
7. **Evidence excerpts are fetched, not written from memory.** During the build each source
   URL is read; the quote and locator come from the page. Unreachable or non-matching
   sources leave `excerpt` null, are marked `TODO(evidence)` and listed for you at the end.
8. **Demo data:** the demo seed publishes only the few materials its demo products use, in
   the demo database only, so the card can be seen locally.
9. **`UX-001` exception** recorded as `DEC-022`: the card may show "estimate",
   "Not yet measured", the verification badge and the "How we know this" disclosure.
10. Spec names are kept (`Fiber`, not `Fibre`); tables follow repo style (PascalCase models,
    cuid ids, SCREAMING_SNAKE enums, no `@map`).

## Build order

Each phase ends green (`npm run check`, plus the checks named), is committed and pushed
to `main` with files staged by path. First step after approval: save this as
`docs/superpowers/specs/2026-11-16-material-library-design.md` and a task-level plan in
`docs/superpowers/plans/2026-11-16-material-library.md`, and log the request in
`docs/CHANGES.md` and `DEC-022` in `docs/decisions.md`.

### Phase 1 — Schema

One migration `20261117090000_material_library` (header comment `-- DEC-022`), new schema
section `// ─── Material library (DEC-022) ───`:

- Taxonomy: `Fiber`, `YarnProcess`, `FiberStandard`, `Construction`, `Finish` (unique `code`).
- Library: `Material` (`status DRAFT|PUBLISHED`, `stretchType`, `feelsLikeAnchor`),
  `MaterialFiber` (percentage).
- Provenance: `Source` (`tier A|B|C`), `Evidence` (`subjectType` + `subjectId`, no FK, like
  the repo's `xxxById` strings; `sourceId`, `locator`, `excerpt?`), `Lab`
  (accreditation number, scope list of `TestStandard`), `Measurement` (`testStandard` enum
  from spec §4.1, `accredited Boolean`, report `storageKey`/`contentType`),
  `MethodologyRule` (`@@unique([code, version])`, append-only like `AgreementVersion`),
  `CalibrationSet`, `CalibrationSwatch`.
- Product link: `ProductMaterial` (`role`, `actualGsm`, `actualComposition Json?`,
  `verificationLevel`, `needsReviewAt`, video `storageKey`), `FeelProfile` (per axis:
  basis, value, bandMin, bandMax; `refs Json` holding the rule code+version and the
  evidence/measurement ids used; `computedAt`).
- Raw SQL appended: CHECKs (percentage 0–100, band min ≤ max, values 0–100, gsm > 0),
  partial unique index for one `SHELL` per product, append-only trigger on
  `MethodologyRule` (pattern from `20261105140000_token_ledger`).
- Composition sum = 100 enforced in the service and the loader, with tests.

### Phase 2 — Methodology (pure, `src/lib/materials/`)

- `weight.ts` `WEIGHT_v1` (clamp, 80–400), `estimate.ts` (band rules from call 6),
  `percentile.ts` (log-percentile against a calibration set; returns null when no set),
  `profile.ts` (chooses measured → estimated → not available per axis and returns refs),
  `card.ts` (builds the card payload; every field is `{ value, provenance } | null`),
  `provenance.ts` (field refs such as `pm:<id>:softFirm`), `data.ts` (zod form parsing).
- Rule text and versions live in `rules.ts` and are loaded into `MethodologyRule`; a test
  fails if code and seeded versions differ.
- Unit tests beside each file, including WEIGHT edge cases, band maths, percentile mapping.

### Phase 3 — Seed files and loader

- `seeds/materials/*.json` (33, one per material), `seeds/sources.json`,
  `seeds/evidence.json`, `seeds/taxonomy.json`, `seeds/labs.json`, `seeds/rules.json`.
  Entries cite source codes, never raw URLs.
- `scripts/load-materials.ts` (`npm run materials:load`): idempotent upserts by `code`,
  never truncates, safe on real data; validates with zod first. Exposed as a function,
  called from `prisma/seed.ts` and tests (precedent: `tools/fit-simulation/load.ts`).
- Source excerpts gathered per call 7.
- **Provenance check** `tests/tooling/material-provenance.test.mjs` (runs inside
  `npm run check`, so CI fails): every seeded attribute cites an existing source code or
  rule, or is null; composition sums to 100; no tier is missing. A matching integration
  test asserts the same for every field of `getMaterialCard`.

### Phase 4 — Services

`src/server/materials.ts` + `material-actions.ts`, `material-admin.ts` +
`material-admin-actions.ts`, errors as `MaterialError extends AppError`:

- `listMaterials(filters)`, `getMaterial(code)`, `getMaterialCard(productId)`,
  `getProvenance(fieldRef)`, `setProductMaterial`, `addMeasurement`,
  `recomputeFeelProfile` (run inside the same transaction on every change).
- Ownership in the `where` clause as `saveFitData` does; guards `requireFactory("products")`
  and `requireAdmin("FACTORY")`.
- Storage: add `PDF_TYPES` (10 MB) and `VIDEO_TYPES` (mp4/webm, 30 MB) to
  `src/server/storage/index.ts`. Routes `api/lab-reports/[id]` (owning factory and
  FACTORY/CORE admins; sandbox CSP and 404 denial like `partner-docs`) and
  `api/material-videos/[id]` (public for shop-visible products).
- A measurement whose lab is unknown or whose test is outside the lab's scope is saved
  with `accredited = false` and shown as such.

### Phase 5 — Buyer Material Card

- `src/app/products/[id]/material-card.tsx` (server component) loaded in the page's
  existing `Promise.all`; replaces `MaterialPanel` in `fit-section.tsx`; `FitView.material`
  trimmed to care and stretch.
- Order per spec §7: header + badge, feels-like line, four feel bars, On skin / Made for,
  video, details grid, care, Compare.
- Feel bar is a small read-only component (no `<input type="range">`): solid dot,
  translucent range bar, or dashed track; each has a text equivalent
  ("Softness: estimated 15–30 out of 100, where 0 is softest"). "How we know this" is a
  native `<details>`, the repo's disclosure pattern. Theme tokens only, 360 px first.
- Compare: `/products/[id]/compare` server page, up to 2 products sharing axes.
- Snapshot tests with `react-dom/server` for measured, declared, estimated and mixed
  cards; unit `include` glob widened to `*.test.tsx`.

### Phase 6 — Factory Material card

- New `Card` "Material" on `/seller/products/[id]` beside Fit data: search and filter the
  published library, gsm and composition (pre-filled), optional lab report + measurements,
  optional video, live preview of the buyer card, confirm tick when out of range.
- `fit-data-form.tsx` loses gsm, weave, thermal range and breathability.

### Phase 7 — Admin

Under `/admin/factory/materials` (tab added in `src/app/admin/layout.tsx`), built from
`list-bits.tsx`, `AdminForm`, `PageHeader`:

- Lists and forms for materials (with publish), sources, evidence, rules (publish new
  version only), labs, calibration sets and swatches.
- "Why this value?" on every number: rule + version, evidence or measurement, source link, excerpt.
- Reports: tier-C-only evidence, axes not available, products on library estimate,
  out-of-range products to review.

### Phase 8 — Browser tests and docs

- `tests/e2e/materials.spec.ts` (reduced motion, 360 px): factory picks `cj_crs`, enters
  160 gsm, uploads a measurement, badge changes; axe and overflow checks.
- Cross-account denial tests for lab reports and other factories' products.
- Docs together: `docs/material-system.md` (provenance rules, adding a material),
  operating brief (new `MAT-001`, amend `FIT-001` and `UX-001`), `implementation-status.md`,
  `architecture.md`, `catalogue-admin.md`, `backend-data.md`, `frontend.md`, README
  (`materials:load`), `docs/CHANGES.md`.
- Final summary for the owner: every `TODO(evidence)`, every axis left not available,
  rule tables awaiting sign-off.

## Not built

Per spec §12: AR/haptics, AI feel copy, fit or size recommendations. Also not built now:
the measured 0–100 path stays switched off until a calibration set has real swatch
measurements (tables and admin exist; no invented swatches).

## Verification

Run from `E:\` (uppercase):

- `npm run check` — includes the provenance check and unit tests.
- `npm run db:start`, `npm run test:int` — services, card payload provenance, access denial.
- `npm run build`, `npm run e2e`, `npm run e2e:mobile`.
- Review skills: `groupbasket-access-review`, `groupbasket-browser-review`,
  `groupbasket-verification-router`.
- By hand on the dev database: `npm run db:deploy`, `npm run materials:load`, then as a
  demo factory pick a material and view the product page at 360 px; as a Factory admin
  open "Why this value?" for a slider.
