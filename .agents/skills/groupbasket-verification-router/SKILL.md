---
name: groupbasket-verification-router
description: Choose which existing GroupBasket checks and review skills to run from the files and behaviour a change touches, then run them and report what actually ran. Use after a change or before a commit, PR or handover.
---

# GroupBasket verification router

This skill picks from the existing checks; it adds none. The rules live in [AGENTS.md](../../../AGENTS.md).

1. **Find what changed:** `git diff --name-only origin/main...HEAD` plus `git status --short`.
2. **Select** from the table below. Run each item once, even if several rows select it.

| Changed                                                                                                      | Run                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Anything                                                                                                     | `npm run check`                                      |
| `prisma/**`, `src/lib/decimal.ts`, `src/lib/pack-money.ts`, `src/server/payments/**`, `src/server/tokens.ts` | `groupbasket-money-review`, `npm run test:int`       |
| `src/server/packs*.ts`, `src/server/payments/**`, `src/server/tokens.ts`                                     | `groupbasket-basket-concurrency`, `npm run test:int` |
| `src/app/**/*.tsx`, `src/components/**`, `globals.css`                                                       | `groupbasket-browser-review`, `npm run e2e:mobile`   |
| `next.config.*`, layouts, route handlers, server actions, dependencies                                       | `npm run build`                                      |
| Only `*.md`                                                                                                  | `npm run check:docs` instead of `npm run check`      |
| `.mcp.json`, `scripts/*mcp*`, `scripts/*reader*`                                                             | `npm run test:tooling`, `npm run mcp:verify`         |

3. **Report** each item: why it was selected, the exact command or skill, and its result (pass, fail with the first error, or not run and why). Never mark an item passed without its output.
