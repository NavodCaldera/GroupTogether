---
name: apparel-addons
description: "Clothing-only add-ons for GroupBasket: personalized fit heatmap, body mesh and Deep Fit Test, Material Library and Card, and the audience-filtered shop, switched on only for categories that carry them (DEC-029)."
---

# Apparel add-ons

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `FIT-001`, `MAT-001`, `DEC-020`, `DEC-021`, `DEC-022`, `DEC-025`, `DEC-029`.

## Scope

Since `DEC-029` these features apply only where the product's category carries the matching
feature (`fit`, `materials`, `audience`), set on the Clothing and Shoes roots. Gating is
**Planned**; today every product is clothing so they always apply.

## Ownership and code

- Fit: `src/components/fit/`, `src/lib/fit/`, `src/server/fit*.ts`, `body-fit*.ts`,
  `deep-fit*.ts`, `src/app/account/fit/`, `src/app/admin/factory/fit/`,
  `src/components/fit-data-form.tsx`, `src/app/api/fit-body`, `src/app/api/fit-garment`,
  `scripts/fit-worker.ts`, `scripts/sim-worker.ts`, `tools/`. Product fields `sizeChart`,
  `fabricStretchPct`, `gsm`, `weave`, `careNotes`, `fitApprovedAt`.
- Materials: `src/lib/materials/`, `src/server/materials.ts`, `material-*.ts`,
  `src/components/materials/`, `src/app/admin/factory/materials/`, `seeds/`; see
  [material-system.md](../../docs/material-system.md).
- Audience: `audienceFor` and `kindFits` in `src/lib/taxonomy.ts`, `User.gender`/`birthDate`.

## Implementation guards

- Check features through the one category resolver ([taxonomy](taxonomy.md)); never test category
  names or slugs in components.
- A product outside a fit/materials category shows no fit card, no Material Card, no size chart
  form and no material section; its pages must not load the 3D viewer bundle.
- The audience filter applies only inside categories with `audience`; other categories show to
  everyone.
- The existing guards still apply: photos never leave the phone, no SMPL-family models
  (`npm run check:licences`), no unsourced material numbers, "Guidance, not a guarantee".

## Verification and coordination

Existing `fit`, `deep-fit`, `materials` e2e specs (with `reducedMotion: "reduce"`) plus a check that
a non-clothing product page has none of these sections. Coordinate with
[catalogue-admin](catalogue-admin.md) and [frontend](frontend.md).
