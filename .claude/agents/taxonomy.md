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

**Status: Planned.** None of this is built. Today the catalogue is clothing only:
`enum Category { SHOES, APPAREL }`, `enum Audience`, `Product.kind`, the code-only
`src/lib/taxonomy.ts` (`KINDS`, size sets, `audienceFor`) and `Variant` keyed by `size` + `colour`.

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

- Migrate, don't break: build the clothing tree from `KINDS` (Clothing > Men > Shirts …), link
  every product, and fill `options`/`optionKey`/`label` from `size`/`colour` before any reader
  switches. Drop the old columns only after every reader uses the new ones.
- One helper (`variantLabel`, `optionKeyOf` in `src/lib/`) builds keys and labels; never format
  size/colour by hand on a screen or packing ticket.
- Shop filters and the factory product form come from the category's resolved attributes; do not
  hardcode per-category fields in components.
- Category features gate clothing add-ons: check `features` through one resolver, owned with
  [apparel-addons](apparel-addons.md).
- A factory lists only in APPROVED categories, enforced in the server action, not just the form.
- Category edits never rewrite stored product specs or order snapshots.

## Verification and coordination

Unit tests for key normalisation, attribute inheritance and spec validation; integration tests for
the migration (every product has a category, every variant an `optionKey`, no duplicate keys) and
for listing outside an approved category being refused. Schema with
[backend-data](backend-data.md), listings with [catalogue-admin](catalogue-admin.md), screens with
[frontend](frontend.md), commission with [group-deals](group-deals.md) and [payments](payments.md).
