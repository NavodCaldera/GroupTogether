You are implementing **production hardening change 3: login rate limiting** in the GroupBasket repo
at the current directory, on branch `main`. Claude Code reviews your work afterwards.

## Read first

1. `AGENTS.md` and `CLAUDE.md`: engineering standards, documentation rules.
2. `src/server/auth/service.ts` (`authenticate`, `AuthError`, `DUMMY_HASH`), `src/server/auth/actions.ts`
   (`signInAction`), `prisma/schema.prisma`, and an existing integration test such as
   `tests/integration/admin.int.test.ts` for setup style.
3. `node_modules/next/dist/docs/` before touching any page or action (non-standard Next.js version).

## What to build

- **New Prisma model** `LoginAttempt`: `email String @id` (normalised: trimmed, lower case),
  `failures Int @default(0)`, `lockedUntil DateTime?`, `updatedAt DateTime @updatedAt`.
  One migration named `login_attempts`. Do not grant it to the `gb_ai_reader` role.
- **Rules** (inside `src/server/auth`, no new dependency):
  - Count failures **per email**, including emails with no account (so the lock cannot be used to
    tell which emails exist).
  - On the **5th** consecutive failure, set `lockedUntil = now + 10 minutes`.
  - While `lockedUntil > now`: refuse **before** checking the password, with
    `AuthError("Too many sign-in attempts. Try again in 10 minutes.")`. The same message for
    existing and unknown emails. Refused attempts while locked do not extend the lock.
  - When the lock has expired, the next attempt starts from zero failures.
  - A successful sign-in deletes the email's row (clears the counter).
  - A wrong password on a locked account (`user.locked`) still counts as a failure; keep the
    existing locked-account message for a correct password.
- **Concurrency:** record a failure with one atomic statement (e.g. `INSERT … ON CONFLICT (email)
  DO UPDATE` via `$executeRaw` with tagged-template parameters, or a transaction holding a row lock),
  so 10 parallel wrong attempts cannot all slip past the limit. Never interpolate strings into SQL.
- **Testability:** `authenticate(email, password, now = new Date())`. Keep the existing signature
  working for callers.
- Keep the dummy-hash timing protection for unknown emails.

## Tests (write first, see them fail, then implement)

`tests/integration/login-lockout.int.test.ts` on the `groupbasket_test` database:
1. 4 wrong passwords then the right one: signs in, and the row is gone.
2. 5 wrong passwords: the 6th attempt **with the correct password** is refused with the lockout
   message.
3. Lockout expires: after 5 failures at `t`, the correct password at `t + 10 min + 1 s` succeeds and
   clears the row.
4. Unknown email: 5 attempts lock it with the same message as a real account.
5. Parallel: 10 concurrent wrong attempts leave `failures` ≥ 5 and the account locked.
6. Email normalisation: `" User@X.lk "` and `"user@x.lk"` share one counter.

## Constraints

- No new dependencies, no paid services. Money untouched.
- Do not touch the factory partnership files (Parts 1–4) or Sentry files.
- Stage files by path (`git add <paths>`), never `git add -A`. One commit, ending with your
  `Co-Authored-By` line. Do not push, deploy, touch production data, read secrets or reset branches.
- Update `docs/CHANGES.md` (newest first, dated 2026-11-05, "Production hardening 3: login rate
  limiting"), `docs/implementation-status.md` ("Production hardening" section), and
  `.claude/agents/qa-review.md` or the relevant specialist with the rule and test file.
- No explainer text in the UI; the sign-in form already shows `AuthError` messages.

## Before finishing, run and report

`npm run check`, `npm run test:int`, `npm run build`, and `npx prisma migrate status`.
Report: commit hash and message, the output summary of each command, any deviation from this prompt
and why, and anything you were unsure about.
