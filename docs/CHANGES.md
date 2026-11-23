# Changelog

Newest first. The history of the earlier models (clothing, agents, any-product deals) is in this
file at the `any-product-pivot-2026-11-23` tag.

## 2026-11-23: Brand logos, Budget and Premium packs

The owner asked for these changes:

- **Home:** the heading is "Direct factory to consumer. No more middle man." The words "Family packs" are gone from the home page and the footer.
- **Brand logos:** companies show their logo instead of their name. The logos come from each company's own website and are stored in `public/logos/`, with a new `Company.logo` field (migration `20261123120000_company_logo`).
- **Demo badge:** no longer shown. The `demo` field stays as an internal marker.
- **Packs:** every company has exactly two standard packs, Budget and Premium. Both run for 30 days and are made for a family of 4, shown as "Family of 4". The 15-day packs are gone. Slugs are `<company>-budget` and `<company>-premium`.
- **Back links:** added to the company, pack and basket pages.

## 2026-11-23: Basket filter follows the category

On Open baskets, the Company list shows only the companies in the chosen category, and a company
outside the new category is cleared (`BasketFilter` in `src/components/client.tsx`).

## 2026-11-23: Minimal core (cleanup)

The owner asked for the smallest system that runs the family-pack model, file by file, with no
unused code.

- **Removed the old models:** agents, carts, orders, checkout, factories, brands and gifts, 3D fit and body mesh, the material library, group deals, returns, quality, payouts, notifications, private file storage, and the admin and seller areas, along with their pages, server code, tests, tools, `fit-lab`, 3D assets, material seeds and specialist agent files.
- **Database:** 16 tables instead of over 90, in one fresh migration (the system was never published). `User` has no role, lock or old profile fields. `Category` is flat. The token ledger keeps two kinds, `PACK_REFUND` and `LATE_PAYMENT`, and its append-only trigger.
- **Code:** sign-in and sign-up are down to name, email, mobile, address pin and password, with no gender or date of birth. The tokens page shows the balance and refund history, without transfers. The header has Home, Baskets and Tokens. Payment notices handle basket spots only, and the daily job runs only the basket sweep. Unused exports, components and helpers are gone.
- **Dependencies:** removed three.js, MediaPipe, OpenCV and fast-check.
- **Docs:** this changelog restarted. The brief, decisions, architecture, README, AGENTS.md and CLAUDE.md now describe only DEC-030. Implementation status merged into architecture, and the four specialist agent files merged into AGENTS.md.
- **Tests:** new or rewritten integration tests for payments, tokens, seed and sign-in lockout; a browser journey for a buyer joining a basket and paying; and accessibility checks for every page.

## 2026-11-23: Family packs (DEC-030, PR #52)

- Home lists categories with their companies. Each company page shows its standard packs and open baskets within 1 km, contacts first. Pack and basket pages added.
- Paying to start opens a basket, and paying to join takes a spot. A full basket places the order with the company.
- The daily sweep frees unpaid spots, extends a basket twice, then closes it with token refunds.
- The Open baskets tab filters by company or category.
