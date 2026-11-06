You are cleaning up **old wording and footwear leftovers** in the GroupBasket repo at the current
directory, branch `main`. This is the "Policy mismatch" row in `docs/implementation-status.md`
(Clothing catalogue and business scope). Claude Code reviews your work afterwards.

## Read first

`AGENTS.md`, `CLAUDE.md`, `.claude/agents/groupbasket.md` (business scope table, `CAT-002`,
`DEC-010` factory-direct fulfilment), `.agents/rules/product-focus.md`, `docs/decisions.md`
(`DEC-005`), and `node_modules/next/dist/docs/` before editing pages.

## The rule (already approved; do not change it)

- Clothing and apparel are the **main** business. Factory surplus and B-grade clothing are only a
  **secondary** range.
- Shoes and footwear are **excluded**.
- Since `DEC-010`, clothes come **directly from partner factories**. Shoppers share a cart to
  reach the minimum, the owner pays once, and the cart is delivered by PickMe.

Do not invent new claims, prices, guarantees or features in the copy. Use only facts from the
operating brief.

## What to change

1. **Home page** (`src/app/page.tsx`): lead with group buying of clothing from partner factories.
   Remove "We buy surplus and B-grade stock in bulk", and do not make surplus the headline.
   Surplus may appear at most as a minor mention, or not at all. Keep the current layout and
   primitives. Add no explainer paragraphs, and keep the text short.
2. **Metadata and footer** (`src/app/layout.tsx`): remove "shoes", and change the surplus-first
   description and the footer tagline "Bulk surplus, bought together" to clothing-first wording.
3. **Taxonomy** (`src/lib/taxonomy.ts`):
   - Remove every `SHOES` kind and the `SHOE_ADULT`/`SHOE_KID` sizes, so footwear can no longer be
     chosen when creating or editing a product, or used as a filter.
   - Update `src/lib/taxonomy.test.ts`. A test must prove that no kind has category `SHOES`.
4. **Seed data** (`prisma/seed.ts`, `scripts/seed-brand-demo.mjs`):
   - Replace the footwear demo products with clothing products.
   - Keep any IDs, names or values that tests depend on, or update those tests in the same commit.
5. **The 👟 icon** in `src/components/cart-bits.tsx`: keep it working for stored legacy rows, but
   make sure nothing new can show it.
6. **README** line 6: make it clothing-first, with surplus as secondary and footwear excluded.

## Do NOT change

- **The `Category.SHOES` enum in `prisma/schema.prisma`, and the `StockType` enum.** Existing rows
  may use them. Make no migrations and no schema changes.
- Existing stored products, and any database data.
- `CAT-002` stock-type behaviour in `src/server/catalogue.ts` and the `FACTORY_SURPLUS` default.
  `DEC-005` is still open.
- The shop page `stockType` filter, unless it is footwear-specific.
- Old migrations, `docs/CHANGES.md` history, `docs/handover/` and `_bmad-output/`. These are
  history and must be left as written.

## Tests

- If integration or e2e tests use shoe fixtures (`tests/integration/helpers.ts`,
  `open-carts.int.test.ts`, `samples.int.test.ts`, `factory-admin.int.test.ts`,
  `catalogue-eligibility.int.test.ts`, and `tests/e2e/journey.spec.ts`, `quality.spec.ts`,
  `returns.spec.ts`), switch them to clothing. Do not change what any test proves.
- Add an e2e check that the home page contains no "B-grade", "shoes" or "footwear" text, at
  desktop and at 360px, with no horizontal overflow and zero Axe violations.

## Docs

- In `docs/implementation-status.md`, change the "Clothing catalogue and business scope" row from
  `Policy mismatch` to `Implemented`, and say that the legacy `SHOES` enum is kept for stored rows.
- In `.claude/agents/groupbasket.md` line 50, remove "Remaining footwear code/demo content…" if it
  is no longer true.
- Update the matching lines in `.claude/agents/catalogue-admin.md` and `backend-data.md`, if they
  mention footwear leftovers.
- Add a dated `docs/CHANGES.md` entry (2026-11-06). Commit this prompt file too.

## Constraints

- No new dependencies, no schema changes, no production data, no secrets, no deploying.
- Stage by path, never `git add -A`. One commit, with your `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int` and `npm run build`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e` (the full suite). All must pass.
  Then run `git push origin main`.
- No force-push, no amending pushed commits, no branch resets.

## Report

- Commit hash and the push result.
- Each command's summary.
- The old and new home page, metadata and footer text, side by side.
- A list of the footwear items removed, and the clothing items that replaced them in the seed.
- Any remaining "shoe", "footwear" or "surplus" mentions in `src/`, and why each was kept.
