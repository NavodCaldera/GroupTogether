You are fixing three review findings on **factory partnership Part 1** (commits `aaf0df9`,
`f720cf1`, `477c006`) in the GroupBasket repo at the current directory, branch `main`. Claude Code
reviews your work afterwards. Do these before any Part 2 work.

## Read first

`AGENTS.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-11-05-factory-partnership.md` (Part 1),
`src/server/partners.ts` (`reviewApplication`, `redeemApprovalLink`), `src/server/auth/service.ts`
(`hashToken`, `userForToken`), `src/app/factories/sign-in/[token]/page.tsx`,
`src/app/admin/factory/applications/[id]/page.tsx`, `src/server/catalogue.ts`,
`tests/e2e/admin-workspaces.spec.ts`, `tests/integration/partners.int.test.ts`, and
`node_modules/next/dist/docs/` before changing pages or actions.

## Finding 1 (security, must fix): the approval link is a live 7-day login

Today `reviewApplication` stores `hashToken(token)` as a real `Session` row. Anyone who has the link
can put the raw token into the `gt_session` cookie and be signed in as the factory owner for 7 days,
without setting a password and without using the link up. The raw token is also stored in plain text
in `Notification.href`, and the admin detail page reads it back from there.

Required:
- New Prisma model `FactoryActivation`: `id String @id` (= `hashToken(rawToken)`), `userId`,
  `createdById` (admin), `createdAt`, `expiresAt` (+7 days), `usedAt DateTime?`. Index on `userId`.
  Migration `factory_activation_tokens`. Do not grant it to `gb_ai_reader`.
- Approval no longer creates a `Session`. It creates a `FactoryActivation` and returns the raw link
  **once** to the approving admin (e.g. redirect to the detail page with a one-time flash or a
  short-lived server-rendered display right after the action). The raw token is never stored anywhere.
- The admin detail page gets a **"New sign-in link"** action (FACTORY/CORE admins, application
  `APPROVED`): it marks every unused activation for that user as used and issues a fresh one, shown
  once. The page no longer reads any token from notifications.
- The approval notification keeps its title/body but its `href` contains no token (use `/sign-in`).
- `redeemApprovalLink(token, password)`: lock the activation row (`FOR UPDATE`), require
  `usedAt = null`, `expiresAt > now`, and the same user conditions as today; set the password, set
  `usedAt`, then start a normal session the usual way. A `FactoryActivation` id must never be
  accepted by `userForToken`.
- **Legacy owners** (an authenticated existing seller who applied from the seller area, and who
  already has a password) must **not** get an activation link at all: approval just notifies them.
  Otherwise the link would let whoever holds it reset an existing account's password.
- Migration data step: delete `Session` rows created by approvals that were never redeemed, and
  replace `Notification.href` values starting with `/factories/sign-in/` with `/sign-in`. Work out
  how to identify those sessions safely (e.g. sessions of approved factory users with no usable
  password) and explain it in the report. Only `groupbasket` dev and test databases exist; never
  run anything against other databases.

Tests (`tests/integration/partners.int.test.ts`, write first, see them fail):
1. After approval, no `Session` row exists for the new owner, and `userForToken(rawToken)` is null.
2. No `Notification.href` contains the raw token.
3. Redeem works once; the second redeem fails with "Sign-in link expired or already used".
4. Expired activation (now > expiresAt) fails.
5. "New sign-in link" makes the old link fail and the new one work.
6. Approving a legacy owner creates no activation, and their password hash is unchanged.
7. Only FACTORY/CORE admins can issue a new link; others get the existing denial.

## Finding 2: the admin nav e2e test is stale

`tests/e2e/admin-workspaces.spec.ts:15` expects the Factories admin tabs
`["Factories", "Stock", "Lots", "Products", "Offers", "Users"]`, but Part 1 added "Applications"
after "Factories". Update the expectation to include it. Do not loosen the assertion (keep the
exact list and order, matching however the test already handles badge counts).

## Finding 3: shop eligibility overwrites the brand exclusion

In `src/server/catalogue.ts`, `{ ...IN_SHOP, AND: [eligibility] }` replaces `IN_SHOP.AND` (which
excludes premium brand products). It is safe today only because `sellingFactoryWhere` repeats
`isBrand: false`. Merge instead: `AND: [...IN_SHOP.AND, eligibility]` at every call site (list,
suggest, facets and any other). Add an integration test that a brand product is excluded from
`listProducts` even if `sellingFactoryWhere` would match it (e.g. assert the generated filter keeps
both conditions, or seed a brand seller with an ACTIVE profile and accepted agreement).

## Constraints

- No new dependencies. Do not start Parts 2–4. Do not touch Sentry, login lockout or security
  header code. UI: phone first, existing primitives, no explainer text.
- Update `docs/CHANGES.md` (newest first, dated 2026-11-05, "Factory partnership Part 1: review
  fixes"), `docs/implementation-status.md`, `docs/architecture.md` if it describes the sign-in link,
  and the factories/admin specialist file. Commit this prompt file too.
- Stage by path, never `git add -A`. One commit per finding (three commits) with your
  `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build`, `npx prisma migrate status`, and the full
  `npm run e2e` against a production build (`GROUPBASKET_E2E=1 npx next build` then `CI=1 npm run e2e`).
  All must pass, including `admin-workspaces.spec.ts`. Only then `git push origin main`.
  No force-push, deploy, production data, secrets or branch resets. Do not amend pushed commits.

## Report

Commit hashes and messages, push result, each command's summary, how the migration identified old
approval sessions and how many rows it changed in dev, any deviation and why, and anything unsure.
