<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## GroupBasket repository instructions

### Read order

1. This file covers the workflow and engineering rules.
2. The [operating brief](.claude/agents/groupbasket.md) holds the business rules (PK-1 to PK-9).
3. [Architecture](docs/architecture.md) is the code map, and says what is built.
4. [Decisions](docs/decisions.md) lists what is decided and what is still open. Never invent an answer to an open question.

### Engineering rules

- **Keep it small.** Use the fewest files and lines that do the job. Delete unused code instead of keeping it. No heavy UI libraries, paid services, always-on workers, queues or caches.
- **Server first:** render pages on the server and keep client components to small islands. Select only the fields you need, and avoid N+1 queries.
- **Money** is `Decimal(14,2)` in the database and `D`, `toD` and `roundMoney` from `src/lib/decimal.ts` in code; never JavaScript `number`. Refunds are tokens only.
- **Transactions:** basket and payment changes run in one transaction, locking the `PaymentAttempt` row first, then the `PackGroup` row. Never call the payment gateway inside a transaction.
- **Time-based rules** run only in `sweepPackGroups`, called daily by the cron route; page loads never run them.
- **Placement:** pure rules go in `src/lib/` and database changes in `src/server/`.
- **No explanation text in the interface.**
- **Checks:** `npm run check` before every commit. Also run `npm run test:int` for server changes and `npm run e2e` for page changes. Tests use only the loopback `groupbasket_test` database. Report what actually ran.
- **Skills:** `groupbasket-money-review`, `groupbasket-basket-concurrency`, `groupbasket-browser-review` and `groupbasket-verification-router` live in `.agents/skills/`. Claude Code reaches them through pointer files in `.claude/skills/`; edit only `.agents/skills/`.
- **Branches:** every change goes on a new branch from `origin/main`, through a pull request, and merges only after its GitHub checks pass. Stage files by path, never with `git add -A`.

### Where each fact lives

| Fact                           | Home                                               |
| ------------------------------ | -------------------------------------------------- |
| Workflow and engineering rules | This file                                          |
| Business rules                 | [Operating brief](.claude/agents/groupbasket.md)   |
| Code map and what is built     | [Architecture](docs/architecture.md)               |
| Decisions and open questions   | [Decisions](docs/decisions.md)                     |
| Setup and commands             | [README](README.md), [package.json](package.json)  |
| Tooling                        | [Development tooling](docs/development-tooling.md) |
| Change history                 | [Changelog](docs/CHANGES.md)                       |
