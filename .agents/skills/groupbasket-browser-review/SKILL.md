---
name: groupbasket-browser-review
description: Verify changed GroupBasket screens with local Playwright: mobile layout, accessibility and the buyer basket journey.
---

Read `AGENTS.md` first. Use the seeded demo buyers and the isolated test database, and pay only through the demo gateway.

The journeys are in `tests/e2e/family-packs.spec.ts` and `accessibility.spec.ts`. Check every changed screen at 360 px. Run `npm run e2e` (desktop and mobile) or `npm run e2e:mobile`; both seed the test database, never development.

Inspect changed forms, errors, keyboard focus and narrow-screen overflow. Treat axe results as partial evidence and check keyboard use and labels by hand. Turn any regression you find into a focused test, and never weaken an assertion to make a test pass.
