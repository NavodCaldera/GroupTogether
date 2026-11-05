You are fixing one review finding on commit `b82f1c4` (factory activation links) in the GroupBasket
repo at the current directory, branch `main`. Claude Code reviews your work afterwards.

## Finding (confirmed by a Claude Code test)

`issueActivationLink` in `src/server/partners.ts` still works **after the owner has redeemed their
link and set a password**. It only checks that some activation row exists. A Factories admin can
then issue a new link, redeem it with a password of their choosing, and sign in as the factory
owner. Probe result: approve → owner redeems → admin `issueActivationLink` → redeem with
`"adminchosen123"` → `authenticate(ownerEmail, "adminchosen123")` succeeds.

Cause: `usedAt` means both "redeemed by the owner" and "revoked when a new link was issued", so the
code cannot tell whether the owner has already activated.

## Required change

- Add `revokedAt DateTime?` to `FactoryActivation` (migration `factory_activation_revoked`).
  `usedAt` now means redeemed only. Data step: none needed beyond the column (existing dev rows
  are 0); if any row has `usedAt` set by a replacement, there is no way to tell, so leave it.
- `issueActivationLink`: inside its transaction, after locking the owner, refuse with
  `PartnerError("This factory owner has already set a password")` when any activation for the user
  has `usedAt` set. Revoke unused links with `revokedAt = now` (not `usedAt`).
- `redeemApprovalLink`: require `usedAt = null` **and** `revokedAt = null`.
- Admin detail page: hide the "New sign-in link" action once the owner has redeemed.

## Tests (`tests/integration/partners.int.test.ts`, write first, see them fail)

1. After the owner redeems, `issueActivationLink` throws "This factory owner has already set a
   password" and the owner's password hash is unchanged.
2. A revoked link (replaced by a new one) fails to redeem; the replacement still works (keep the
   existing test passing).
3. Redeemed link cannot be redeemed again (existing test).

## Constraints

- No new dependencies. Touch only the activation code, its page/action, schema/migration, tests and
  docs. Update the `docs/CHANGES.md` Part 1 review-fixes entry (or add a dated line under it),
  `docs/architecture.md` and `.claude/agents/catalogue-admin.md` where they describe activation.
  Commit this prompt file too.
- Stage by path, never `git add -A`. One commit with your `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int`, `npm run build`, `npx prisma migrate status`, and
  `GROUPBASKET_E2E=1 npx next build` then `CI=1 npx playwright test tests/e2e/partners.spec.ts`.
  All must pass; then `git push origin main`. No force-push, amend of pushed commits, deploy,
  production data, secrets or branch resets.

## Report

Commit hash, push result, each command's summary, any deviation and why.
