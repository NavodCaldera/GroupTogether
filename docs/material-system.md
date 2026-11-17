# Material system (DEC-022)

The Material Library holds fabric-level facts. A factory picks one library material per product
and declares its own gsm and composition. Buyers see the result as the **Material Card** on the
product page.

## The rule: no unsourced numbers

Every value a buyer sees comes from one of four places:

| Kind          | What it is                                                                         | Example                                  |
| ------------- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `measurement` | A lab result entered by the factory (`Measurement`)                                | ISO 3801 mass per area, 176 g/m²         |
| `evidence`    | A claim with a quote and locator from a published source (`Evidence` → `Source`)  | "the standard T-shirt fabric"            |
| `rule`        | A versioned GroupBasket rule (`MethodologyRule`) applied to evidence or measurements | `WEIGHT` v1, `SURFACE_EST` v1           |
| `declared`    | The factory's own figure (gsm, composition, care)                                  | 180 gsm                                  |

Anything else is stored as null and shown as "Not yet measured". Three checks enforce this:

- `checkLibrary` ([seed.ts](../src/lib/materials/seed.ts)) fails on any stored number or text in
  `seeds/` without a matching **verified** evidence row (one with a quote), on unknown codes, on
  a composition that does not add up to 100, and on a lab scope without a checked date.
  [seed.test.ts](../src/lib/materials/seed.test.ts) runs it inside `npm run check` and builds
  every library card, failing if any shown value lacks provenance.
- `npm run materials:load` refuses to load while `checkLibrary` reports anything.
- [materials.int.test.ts](../tests/integration/materials.int.test.ts) builds a product's card
  from the database and checks every shown value is sourced and every cited row has a quote.

Evidence without a quote (the source could not be read) is stored and listed, never used.

## Where things live

| Part                                 | Files                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Seed data                            | `seeds/sources.json`, `evidence.json`, `taxonomy.json`, `labs.json`, `materials/*.json` |
| Rules, estimates, profile, card      | [src/lib/materials/](../src/lib/materials/) (pure, unit-tested)          |
| Loader                               | [material-load.ts](../src/server/material-load.ts), [scripts/load-materials.ts](../scripts/load-materials.ts) |
| Services and actions                 | [materials.ts](../src/server/materials.ts), [material-actions.ts](../src/server/material-actions.ts), [material-admin.ts](../src/server/material-admin.ts) |
| Buyer card                           | [material-card-view.tsx](../src/components/materials/material-card-view.tsx), `/products/[id]`, `/products/[id]/compare` |
| Factory card                         | `/seller/products/[id]` (Material section)                               |
| Admin                                | `/admin/factory/materials` (list, publish, Why this value?, tables, reports) |
| Files                                | `/api/lab-reports/[id]` (owning factory, Factory and Core admins), `/api/material-videos/[id]` (public with the product) |

## The four feel bars

Each bar is 0–100. Per bar the profile takes, in order: **measured** (an accredited lab result
ranked against the reference swatch set), **declared** (weight only, from the factory's gsm),
**estimated** (a band from a rule), else **not available**.

- **Weight** (`WEIGHT` v1): `clamp((gsm − 80) / (400 − 80) × 100)`. The 80–400 gsm span is a
  GroupBasket choice covering the library.
- **Softness** (`SOFT_EST` v1) and **Surface** (`SURFACE_EST` v1): a published hand or surface
  word (limp … stiff, smooth … strongly textured) placed on a GroupBasket band, moved by yarn,
  fibre or finish only where a verified source supports the direction.
- **Breathability** (`BREATH_EST` v1): knits only, weight position ± 15.
- The measured paths (`SOFT_MEAS`, `SURFACE_MEAS`, `BREATH_MEAS`) stay off until a calibration
  set has at least 10 accredited swatch results. No set exists yet.

The bands are product decisions stated in the rule text, not measurements.

## Verification badge

- **Lab-measured:** every shown bar is measured.
- **Factory-declared:** the factory entered a lab result or its own composition.
- **Estimated from fabric type:** otherwise.

A lab result counts as accredited only when its lab is in the library and the lab's scope,
checked on a recorded date, lists the test. All eight seeded labs have an empty scope because
their scope documents could not be read, so every result is "not accredited" until a Factory
admin's team checks a scope and records it in `seeds/labs.json`.

## Factory figures far from the library

A gsm more than 15% outside the material's range, or a composition differing by more than 15
points, needs a tick from the factory and lands in **Materials → Reports → To check** for a
Factory admin. The card shows at once (no approval gate, `SUP-002`).

## Adding or changing a material

1. Find a source and read it. Add it to `seeds/sources.json` with its tier (A standard or peer
   reviewed, B industry body, C trade guide) and the date read.
2. Add evidence rows with the quote (≤ 300 characters) and locator. A row without a quote is
   allowed but unused.
3. Add `seeds/materials/<code>.json`. Every gsm range, feels-like, stretch type and end use needs
   a verified evidence row on the material with the same value.
4. `npm run check`, then `npm run materials:load` on each database. New materials load as drafts;
   publish them in **Materials**.

## Changing a rule

Rules are append-only (a database trigger blocks updates). Change the numbers in
[rules.ts](../src/lib/materials/rules.ts) **and** raise its `version`; the loader refuses a
changed rule that keeps its version. Stored feel profiles keep the version they were computed
with until the product material is saved again.
