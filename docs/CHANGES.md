# Changelog

Newest first. The history of the earlier models (clothing, agents, any-product deals) is in this
file at the `any-product-pivot-2026-11-23` tag.

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
