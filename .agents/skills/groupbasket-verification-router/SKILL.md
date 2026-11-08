---
name: groupbasket-verification-router
description: Choose which existing GroupBasket checks and review skills to run from the files and behaviour a change touches, then run them and report what actually ran. Use after a change or before a commit, PR or handover.
---

# GroupBasket verification router

Selects existing checks; adds none. Rules live in [AGENTS.md](../../../AGENTS.md) and the
[operating brief](../../../.claude/agents/groupbasket.md).

## 1. Find what changed

`git diff --name-only <base>...HEAD` plus `git status --short` (default base: the last commit the
user named, else `origin/main`). Also note behaviour the change claims (money, orders and baskets, roles, UI).

## 2. Select

| Changed                                                                                                                                                                                                      | Run                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anything                                                                                                                                                                                                     | `npm run check`                                                                                                                                        |
| `prisma/schema.prisma`, `prisma/migrations/**`, `Decimal`, `src/lib/agent-money.ts`, prices, totals, fees, `src/server/payments/**`, `src/server/payouts/**`, `src/server/tokens.ts`, deposits               | `groupbasket-money-review`, `npm run test:int`                                                                                                         |
| A migration adding tables or columns with personal, bank, ID, photo or message data                                                                                                                          | `groupbasket-access-review`; after the migration is applied, re-run the reader refusal test against each new table (see `docs/development-tooling.md`) |
| `src/server/orders/**`, `src/server/agents/**`, `src/server/payouts/**`, `src/server/payments/**`, `src/server/tokens.ts`, `src/server/returns.ts`, `src/server/sweep.ts`, stock holds, baskets, token holds | `groupbasket-cart-concurrency`, `npm run test:int`                                                                                                     |
| `src/app/admin/**`, `src/app/seller/**`, `src/app/agent/**`, `src/app/agents/**`, `src/app/api/**`, `src/server/storage/**`, roles, private files                                                            | `groupbasket-access-review` with cross-account denial tests                                                                                            |
| `src/app/**/*.tsx`, components, `globals.css`                                                                                                                                                                | `groupbasket-browser-review`, `npm run e2e:mobile`                                                                                                     |
| `next.config.*`, layouts, route handlers, server actions, dependencies                                                                                                                                       | `npm run build`                                                                                                                                        |
| Only `*.md`                                                                                                                                                                                                  | `npm run check:docs` instead of `npm run check`                                                                                                        |
| `.codex/**`, `.mcp.json`, `scripts/*mcp*`, `scripts/*reader*`                                                                                                                                                | `npm run test:tooling`, `npm run mcp:verify`                                                                                                           |

Run each selected item once, even if several rows select it.

## 3. Report

For each item: why it was selected, the exact command or skill, and its result (pass, fail with
the first error, or not run and why). Never mark an item passed without its output.
