You are writing the **final handover report** for the work done on 2026-11-05 and 2026-11-06 in
the GroupBasket repo, at the current directory, on branch `main`. This is documentation only:
**do not change any code, tests, schema or config.** Claude Code reviews the report afterwards.

## Audience

The owner (not a developer) first, and a future developer second. Use plain, short sentences.
Put the owner's summary first and the developer detail after it.

## Sources (use only these; do not invent facts)

- `git log --oneline 8a74159..HEAD` and `git show --stat <hash>` for each commit.
- `docs/CHANGES.md` (the entries dated 2026-11-05 and 2026-11-06), `docs/decisions.md`
  (`DEC-013`), `docs/implementation-status.md`, `docs/architecture.md`,
  `docs/development-tooling.md`, `.claude/agents/groupbasket.md`.
- The approved planning documents:
  - the brief in `_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-04/`;
  - `specs/001-factory-partnership/spec.md`;
  - `docs/superpowers/specs/2026-11-05-factory-partnership-design.md`;
  - `docs/superpowers/plans/2026-11-05-factory-partnership.md`.
- Every prompt in `docs/superpowers/prompts/`. These are the review findings and the fixes that
  were asked for.

If a fact is not in these sources, leave it out or list it under "Not verified". Do not claim
anything was deployed, configured on a live server, or tested with real payments, PickMe or
Sentry. None of that happened.

## Write `docs/handover/2026-11-06-handover.md` with these sections

1. **Summary for the owner.** Up to 10 bullets: what GroupBasket can now do that it couldn't on
   2026-11-04.
2. **How the work was done.**
   - Planning: BMad brief, then Spec Kit spec, then Superpowers design and plan.
   - Building: Codex built each part from a prompt. Claude Code reviewed each part through
     `groupbasket-verification-router`, and fixes went back to Codex. The last returns follow-up
     was finished and committed by Claude Code after Codex hit its rate limit (`bfd4e39`).
3. **What was built.** A table with one row per area: Part 1 joining, Part 2 commission and tokens,
   Part 3 quality, Part 4 returns, the member-done rule (`CART-006`), and production hardening 1–4.
   Columns: area, what it does in one line, main commits, main files, tests.
4. **Rules the owner decided.** Every owner decision made during this work, with its date. Take
   them from `DEC-013` and the changelog. Include at least:
   - LKR 0 carts skip the slip;
   - a hidden product in a frozen cart is cancelled after payment;
   - members mark their items done (`CART-006`) and the owner may remove a member who is not done;
   - every factory refusal goes to an admin, who discusses it with the factory in a private thread
     and makes the final decision;
   - a used buyer-fault item is reviewed by an admin;
   - no sending a return before approval.
5. **Problems found in review, and how they were fixed.** One line each, with the fixing commit:
   - approval sign-in link worked as a login;
   - the "new link" reset after activation;
   - the admin nav test was stale;
   - the catalogue brand filter was overwritten;
   - login lockout held a database connection during hashing;
   - the "Everyone is done" message was missed on remove, leave or emptying;
   - the return stuck case.
6. **Verification evidence.** The most recent results stated in the commits and prompts' reports:
   unit, integration and browser test counts, migrations, and the read-only reader refusal checks
   for every new private table. Say clearly that these are local and CI test results, not
   production proof.
7. **Open items and things that need the owner.** Include at least:
   - **Sentry:** set the DSN and `SENTRY_ORG`/`SENTRY_PROJECT`, then sign in through `/mcp`. Until
     then, no events have been sent.
   - **PickMe:** drops and return pickups are booked by hand (manual mode).
   - **Not built (non-goals):** factory payouts and earning release.
   - **Hosting:** hosting, storage and the cron schedule are undecided. Lockout times assume the app
     and database share a time zone.
   - **Small known notes:**
     - the Zod `jitless` setting lives in `src/lib/location.ts`;
     - the CSP test depends on OpenStreetMap and Photon being up;
     - the CSP allows `'unsafe-inline'` scripts because there are no nonces yet;
     - opening a return message thread takes return and cart locks;
     - Sentry's build-time plugin adds moderate `npm audit` warnings.
   - `.claude/settings.json` (an MCP allowlist) was skipped by the owner.
8. **For the next developer.** Where things live (top-level folders, the main server files per
   area). The commands from `README.md`/`package.json` to run checks. The rule that Codex builds
   and Claude Code reviews. Prompts live in `docs/superpowers/prompts/`.

Keep the report under about 300 lines. Use tables where they help. Link files with relative paths.

## Also check (report only; do not fix code)

Confirm that `docs/implementation-status.md` and `.claude/agents/groupbasket.md` agree with the
report (for example, the factory partnership is marked complete and `CART-006` is present). If you
find a documentation mismatch, fix **only that documentation** and list each fix in your report.

## Constraints

- Add a dated `docs/CHANGES.md` line (2026-11-06) pointing to the handover.
- Run `npm run check:docs` and `npx prettier --check` on the files you touched.
- Stage by path, never `git add -A`. One commit, with your `Co-Authored-By` line. Commit this
  prompt file too. Then run `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no secrets.

## Report

- Commit hash and the push result.
- The section list with line counts.
- Any documentation mismatch you fixed.
- Anything you could not verify from the sources.
