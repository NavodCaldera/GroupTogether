You are making two review fixes to the factory fault hold work (`cc2911f`) in the GroupBasket repo at
the current directory, branch `main`. Claude Code reviews your work afterwards. Business rules do
not change.

## Read first

`AGENTS.md`, `CLAUDE.md`, `src/server/fault-holds.ts`, `src/server/quality.ts` (`cleanProducts`,
`cleanFactoryCarts`, `removeFactory`), `sweep()` in `src/server/carts/service.ts`,
`tests/integration/fault-holds.int.test.ts`, and
`docs/superpowers/specs/2026-11-06-returns-fault-limit-design.md`.

## Fix 1: a failed removal after a Remove decision must recover

`decideHold(..., "REMOVE", ...)` commits the decision, then calls `removeFactory`. If `removeFactory`
fails, the hold is decided but the factory stays ACTIVE, and nothing retries it.

- In `sweep()` (the full sweep, not the per-cart one), find holds with `decision = REMOVE` whose
  factory profile is not `REMOVED`, and call `removeFactory(hold.decidedById, hold.factoryId, hold.decisionNote, false)`.
- One failed hold must not stop the others or the rest of the sweep. Follow how `sweep` handles
  errors today.
- Test: make the first `removeFactory` call fail after the decision commits. The hold stays decided.
  A sweep then removes the factory and locks its staff. A second sweep changes nothing.

## Fix 2: `enforceHold` must not hold a transaction during cart clean-up

Today a gate transaction keeps the `FaultHold` row lock and a database connection for the whole
clean-up, for up to 120 seconds. Hold messages wait on it too.

- Hide the products in one short transaction: the hold row lock, skip if decided or cleaned, the
  factory advisory lock, then products in id order. Commit it.
- Run the per-cart clean-up with no surrounding transaction. Before each cart, re-read the hold and
  stop if it has been decided. Add an optional parameter to `cleanFactoryCarts`/`cleanProducts` for
  this check. `removeFactory` keeps its current behaviour without it.
- Set `cleanedAt` in a final short transaction, only if the hold is still open and every cart was
  processed.
- If Continue wins while clean-up is running, carts already cancelled stay cancelled, no more carts
  are cancelled, and no product is hidden again.
- Keep every step safe to re-run: one credit per line, and the sweep retries while `cleanedAt` is
  null.
- Keep the existing removed-factory handling, which closes the hold as `REMOVE`.
- Tests:
  - Continue during clean-up stops further cancellations (use a test hook or fixture to pause
    between carts);
  - `postHoldMessage` and `listHoldMessages` succeed while clean-up is paused;
  - a failure partway leaves `cleanedAt` null, and a retry finishes with one credit per line;
  - all existing fault-hold tests still pass.

## Constraints

- Write the tests first and watch them fail.
- No new dependencies and no schema changes unless you explain why in the report. Touch only these
  files, their tests, and the docs below.
- Add a dated `docs/CHANGES.md` line (2026-11-06) and update the fault hold lock description in
  `docs/architecture.md`.
- Stage by path, never `git add -A`. One commit, with your `Co-Authored-By` line. Commit this prompt
  file too.
- Run `npm run check`, `npm run test:int`, `npm run build`, `npx prisma migrate status`, then
  `GROUPBASKET_E2E=1 npx next build` and `CI=1 npm run e2e`. All must pass. Then run
  `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets.

## Report

Commit hash and push result, each command's summary with test counts, the new `enforceHold` lock
structure, and any deviation and why.
