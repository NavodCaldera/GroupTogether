You are implementing **Part 1 (Joining, checks and agreement)** of the GroupBasket factory
partnership feature, in the repo at the current directory, on branch `main`.

## Read first (in this order, before writing code)

1. `AGENTS.md` and `CLAUDE.md` — engineering standards, documentation rules.
2. `docs/superpowers/plans/2026-11-05-factory-partnership.md` — the approved plan. Do **Part 1
   only**: Tasks 1.1, 1.2, 1.3, plus the Global Constraints and Review Focus sections.
3. `docs/superpowers/specs/2026-11-05-factory-partnership-design.md` — the approved design.
4. `specs/001-factory-partnership/spec.md` — business rules FR-001 to FR-012 and FR-007a.
5. `node_modules/next/dist/docs/` — this Next.js is a non-standard version; check its APIs for
   pages, server actions and route handlers before using them.
6. Existing patterns to copy: `src/server/storage/index.ts` and `src/server/carts/slips.ts`
   (private uploads), `src/server/notify/index.ts`, `src/lib/admin-access.ts`,
   `src/lib/factory-roles.ts`, `src/server/factory-team-actions.ts`, `src/server/seller-actions.ts`,
   `src/server/catalogue.ts`, `sweep()` in `src/server/carts/service.ts`, tests in
   `tests/integration/*.int.test.ts`.

## What to build

- **Task 1.1** — Prisma models `FactoryApplication`, `FactoryDocument`, `FactoryInvite`,
  `AgreementVersion`, `AgreementAcceptance`, `FactoryProfile` and their enums, exactly as named in
  the plan. One migration `factory_partnership_joining`. Data step: every existing `SELLER` user
  with `factoryId = null` gets a `FactoryProfile` (`ACTIVE`, `complianceDueAt = now + 30 days`).
  Seed: agreement v1 (placeholder text "Agreement text supplied by GroupBasket"), profiles for
  demo factories.
- **Task 1.2** — public application form `/factories/apply` and invite form
  `/factories/apply/[token]`; Factories admin queue and detail pages under
  `/admin/factory/applications`; private document route `/api/partner-docs/[id]`. Functions and
  signatures exactly as in the plan (`bankNameMatches`, `missingItems`, `submitApplication`,
  `createInvite`, `reviewApplication`, `recordVisit`, error class `PartnerError`).
- **Task 1.3** — agreement versions (CORE admin publishes, text immutable), owner acceptance page
  `/seller/agreement`, the guard `canSell(factoryUserId, now)` built on the pure
  `sellingAllowed(...)`, `endsAtFor`, `reminderDue`. Apply the guard to: creating/publishing
  listings, adding staff, and shop product queries (products of factories that cannot sell are not
  shown or addable). Seller area redirects owners to `/seller/agreement` while `canSell` is false.
  `sweep()` sends the 30-day reminder once.

## Fixed rules (do not change)

- Required to submit: BR number, BR certificate, owner NIC number, NIC photo, factory address,
  at least one factory photo, bank name, branch, account name, account number.
- Approval is blocked unless the bank account name matches the business name or the owner name
  (ignore case, spaces and punctuation).
- A BR number or owner NIC that appears on a **rejected** application cannot apply again.
- Private documents: only `ADMIN` users with `adminArea` `FACTORY` or `CORE` may open them;
  everyone else gets 404. Never put them in a public URL.
- Agreement term is 12 calendar months from acceptance; reminder when 30 days or fewer remain;
  a new published version must be accepted before selling continues; acceptance records person,
  time and version.
- Existing factories keep selling for 30 days (`complianceDueAt`), then are blocked until they
  accept the latest agreement. (Their application/checks are submitted through the same form from
  inside the seller area — link it from `/seller/agreement`.)
- Expiry never touches paid carts; it only stops listing and hides products from the shop.
- Invites expire after 7 days and work once.
- UI: phone first (360px), existing styles, **no explainer or description lines** in the UI.
- Money is not involved in Part 1; do not add any.

## How to work

- Test first for every function: write the unit and integration tests listed in the plan for
  Tasks 1.2 and 1.3 with the exact values given, run them and see them fail, then implement.
- Unit tests: `npm test`. Integration: `npm run test:int` (uses the local `groupbasket_test`
  database). Before finishing: `npm run check`, `npm run test:int`, `npm run build` must all pass.
- Commit once per task with a clear message ending with a `Co-Authored-By` line for yourself.
  Stage files by path (`git add <paths>`), never `git add -A` — other work shares this folder.
- Do not push, deploy, touch production data, read secrets, or reset branches.
- Do not build anything from Parts 2–4 (commission, tokens, ratings, flags, returns).
- Update `docs/CHANGES.md` (new dated entry, newest first), `docs/implementation-status.md`, and
  the relevant `.claude/agents/*.md` specialist file for factories/admin to describe what now
  exists.

## When done, report

- Commits made (hash + message).
- Output summary of `npm run check`, `npm run test:int`, `npm run build`.
- Any place you had to deviate from the plan, and why.
- Anything you were unsure about.
