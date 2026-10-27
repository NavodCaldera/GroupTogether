---
name: groupbasket-browser-review
description: Verify changed GroupBasket buyer, admin, brand or packing screens with local Playwright, mobile layout, accessibility and role-specific journeys.
---

Read `.claude/agents/frontend.md` and `.claude/agents/qa-review.md`. Use synthetic seeded accounts and the isolated test database for mutations. Never operate real bank or courier services.

Use `npm run browser -- --help` for the pinned Playwright CLI, or existing Playwright tests. Run `npm run e2e` for desktop journeys and 360-pixel mobile/accessibility smoke coverage. Use `npm run e2e:mobile` to focus on mobile checks. These commands migrate/seed the guarded test database, never development.

Inspect changed forms, errors, keyboard focus, narrow-screen overflow and role navigation. Use axe results as partial accessibility evidence, then manually check keyboard interaction and meaningful labels. Keep screenshots/traces in ignored output; never commit authentication state or private records. Convert demonstrated regressions into focused stable tests. Preserve test assertions instead of healing tests by weakening them.
