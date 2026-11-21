---
name: taxonomy
description: "Category tree, per-category attributes, variant options (any axes), category-driven product forms and shop filters, and factory category approval for GroupBasket's any-product catalogue (DEC-029)."
---

# Taxonomy

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

Policy references: `CATG-001`–`CATG-003`, `DEC-029`, `SUP-002`, `CAT-001`, `CAT-002`, `RATE-001`,
`RETURN-001`.

**Status: Partly built.** Phase 2 (category tree) is done: `Category`, `AttributeDef`,
`AttributeOption`, `CategoryAttribute`, `Product.categoryId` (required) and `Product.specs` exist,
and the shop filter and product forms read the tree. Variant options, spec validation, factory
category approval and the removal of the old columns are still planned. `Variant` is still keyed by
`size` + `colour`.

## Code pointers

- Schema: `Category`, `AttributeDef`, `AttributeOption`, `CategoryAttribute` and `LegacyCategory`
  (the old `enum Category`, renamed so the table could take the name) in
  [schema.prisma](../../prisma/schema.prisma). The relation field is `Product.categoryRef` because
  `Product.category` is still the legacy enum column.
- Migration [20261123100000_category_tree](../../prisma/migrations/20261123100000_category_tree/migration.sql)
  inserts the starting tree between `-- tree:start`/`-- tree:end` and links products between
  `-- backfill:start`/`-- backfill:end` (kind leaf, else stored `SHOES` to Shoes, else the Clothing
  root). Tests run both blocks.
- Pure module [src/lib/categories.ts](../../src/lib/categories.ts): seed rows
  (`seedCategories`, `seedAttributes`, `seedCategoryAttributes`, ids from `categoryIdOf(slug)`),
  slug helpers (`kindSlug`, `kindOfSlug`, `audienceOfSlug`, `legacyColumns`) and resolvers
  (`ancestors`, `inSubtree`, `subtreeIds`, `isActive`, `resolveFeatures`, `hasFeature`,
  `resolveAttributes`, `resolveCommission`, `resolveNeedsApproval`, `resolveReturnReasons`,
  `leaves`).
- Server [src/server/categories.ts](../../src/server/categories.ts): `loadCategoryTree` (React
  `cache`, once per request), `categoryChoices` (leaf options for selects, audience-filtered for
  the shop) and `ensureCategoryTree` (upsert by id; the seed and test `resetDb` call it).
- Starting tree: Clothing (features `fit`, `materials`, `audience`; size and colour as variant
  axes) > Men/Women/Girl/Boy/Kid > the kinds in [taxonomy.ts](../../src/lib/taxonomy.ts), plus an
  empty Shoes root with the same features. Slugs are `clothing/men/shirts`; paths are
  `/<rootId>/<id>/` built from ids.
- Saving: [`saveProduct`](../../src/server/catalogue.ts) takes `categoryId` (or the older
  `audience` + `kind`), accepts only an active leaf, and still writes `category`, `audience` and
  `kind`. The shop filters with `?category=<slug>` (old `?kind=` links still work) over the
  category's path.

## Target data model

- `Category` tree: `parentId`, unique `slug`, materialised `path`, `sortOrder`, `active`,
  `commissionPct`/`minCommission` (inherited when null), `features String[]` (`fit`, `materials`,
  `audience`), `needsApproval`, `returnReasons String[]`.
- `AttributeDef` (`key`, `label`, `type` TEXT/NUMBER/ENUM/BOOL, `unit`), `AttributeOption`, and
  `CategoryAttribute` (`required`, `isVariantAxis`, `filterable`, `sortOrder`). Attributes inherit
  from ancestor categories; a child may add, never remove.
- `Product.categoryId` and `Product.specs Json` (product-level values, zod-checked against the
  resolved attributes, GIN index for filters).
- `Variant.options Json`, `Variant.optionKey` (normalised `key=value|…`, sorted keys, lower-case,
  `""` when the product has no axes), `Variant.label`, `sku`, weight and dimensions.
  Unique `[productId, optionKey]`. `OrderLine.variantLabel` snapshots the label.
- `FactoryCategory` (`factoryId`, `categoryId`, `PENDING|APPROVED|REJECTED`, `approvedById`).

## Implementation guards

- Migrate, don't break: the tree is built and every product linked (phase 2); fill `options`/`optionKey`/`label` from `size`/`colour` before any reader
  switches. Drop the old columns only after every reader uses the new ones.
- One helper (`variantLabel`, `optionKeyOf` in `src/lib/`) builds keys and labels; never format
  size/colour by hand on a screen or packing ticket.
- Shop filters and the factory product form come from the category's resolved attributes; do not
  hardcode per-category fields in components.
- Category features gate clothing add-ons: check `features` through one resolver, owned with
  [apparel-addons](apparel-addons.md).
- A factory lists only in APPROVED categories, enforced in the server action, not just the form.
- Category edits never rewrite stored product specs or order snapshots.
- A change to the starting tree goes in `src/lib/categories.ts` and a new migration together; the
  unit test compares the seed rows with the category_tree migration.

## Variant options code (built 2026-11-21, phase 3)

- Helpers: [variant-options.ts](../../src/lib/variant-options.ts) (`cleanOptions`,
  `parseOptions`, `readOptions`, `optionKeyOf`, `variantLabel`, `variantFields`, `formOptions`,
  `optionAxes`, `compareOptions`, `sizeOf`). `variantFields` returns every stored column and keeps
  the legacy `size`/`colour` in step; write variants only through it.
- Migration `20261123200000_variant_options` backfills from `size`/`colour` with the same rules.
- Writes: `adjustStock` in [catalogue.ts](../../src/server/catalogue.ts) takes options (stock
  forms post `option.<name>` fields, or the older `size`/`colour`); [seed](../../prisma/seed.ts).
  Checkout and own-basket payment copy `Variant.label` to `OrderLine.variantLabel`.
- Readers show `variantLabel` (order lines) or `label` (stock, cart). The product page groups
  choices by the option names its variants carry ([add-to-cart-form.tsx](../../src/app/products/[id]/add-to-cart-form.tsx)).
  Fit code reads `sizeOf(options)`.
- Still on the legacy `size` column: the shop size filter and size facet in `catalogue.ts`, until
  filters come from category attributes (phase 4).

## Verification and coordination

Unit tests for key normalisation, attribute inheritance and spec validation; integration tests for
the migration (every product has a category, every variant an `optionKey`, no duplicate keys) and
for listing outside an approved category being refused. Schema with
[backend-data](backend-data.md), listings with [catalogue-admin](catalogue-admin.md), screens with
[frontend](frontend.md), commission with [group-deals](group-deals.md) and [payments](payments.md).
