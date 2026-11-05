You are fixing one review finding on **production hardening change 3 (login rate limiting)**,
commit `35944d7`, in the GroupBasket repo at the current directory, branch `main`.

## Finding (from Claude Code review)

`authenticate()` in `src/server/auth/service.ts` holds a database transaction (one pooled
connection, pool max 10) and an advisory lock **while scrypt verifies the password**. Measured on the
test database: during 60 concurrent wrong sign-ins, an unrelated `SELECT 1` took 521 ms instead of
1 ms. Anyone can flood the public sign-in form and slow every page on the site. Same-email attempts
queue behind the advisory lock and can hit `maxWait` (10 s), which throws a non-`AuthError` (a 500).

## Required change

Restructure `authenticate(email, password, now = new Date())` so **no transaction or connection is
held during `verifyPassword`**:

1. Normalise the email. Read the `LoginAttempt` row (plain query, no transaction).
   If `lockedUntil > now`, throw the lockout `AuthError` without hashing.
2. Look up the user and run `verifyPassword` (dummy hash for unknown emails) outside any transaction.
3. On failure, record it with **one atomic statement**: the existing `INSERT … ON CONFLICT DO
   UPDATE`, extended so an **expired** lock restarts the count at 1 (`CASE WHEN lockedUntil IS NOT NULL
   AND lockedUntil <= now THEN 1 ELSE failures + 1 END`, and the lock is set when that new value ≥ 5).
   Do not extend an active lock: if `lockedUntil > now` in the row, leave it unchanged.
4. On success: if `user.locked`, keep the locked-account message; otherwise `deleteMany` the row
   and return the user.
5. Remove the advisory lock and the interactive `$transaction`.

Accepted trade-off (state it in a code comment): attempts already past step 1 when the 5th failure
lands may still finish their check, so a burst can make a few more guesses than 5; the counter stays
exact and the lock still applies.

## Tests

- Keep all 8 tests in `tests/integration/login-lockout.int.test.ts` passing. Adjust the parallel
  test only if needed: 10 concurrent wrong attempts must leave `failures ≥ 5` and `lockedUntil` set.
- Add: "expired lock restarts the count" — 5 failures at `t`, one wrong attempt at `t + 11 min`
  gives `failures = 1` and `lockedUntil = null`.
- Add: "sign-in does not hold a connection while hashing" — start 30 concurrent wrong attempts for
  different emails, then time `db.$queryRaw\`SELECT 1\``; expect it under 200 ms.

## Constraints

- No new dependencies. Do not touch factory partnership or Sentry files.
- Update the lockout notes you added in `docs/architecture.md`, `.claude/agents/qa-review.md` and
  the `docs/CHANGES.md` entry so they describe the new behaviour (no advisory lock).
- Stage by path (`git add <paths>`), never `git add -A`. One commit ending with your
  `Co-Authored-By` line. Also commit the two prompt files
  `docs/superpowers/prompts/hardening-3-login-lockout.md` and
  `docs/superpowers/prompts/hardening-3-fix-pool.md` in that commit.
- Run `npm run check`, `npm run test:int`, `npm run build`. Only if all pass: `git push origin main`.
  Do not force-push, deploy, touch production data, read secrets or reset branches.

## Report

Commit hash and message, push result, the output summary of each command, and any deviation or
uncertainty.
