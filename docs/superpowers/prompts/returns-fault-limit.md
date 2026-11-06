You are building the **returns rebuild and factory fault limit** in the GroupBasket repo at the
current directory, branch `main`. Claude Code reviews your work afterwards using the money,
cart-concurrency, access and browser review skills.

## Read first (in this order)

1. `AGENTS.md`, `CLAUDE.md`, `.claude/agents/groupbasket.md` (`PAY-003`, `RETURN-001`,
   `QUAL-001`, `CART-006`).
2. The binding design: `docs/superpowers/specs/2026-11-06-returns-fault-limit-design.md`.
3. The plan: `docs/superpowers/plans/2026-11-06-returns-fault-limit.md`. Its tasks, signatures,
   Global Constraints, Review Focus and test values are binding. Do Tasks 1 to 5 in order.
4. `specs/001-factory-partnership/spec.md`: US7, US8, FR-019a, FR-021, FR-030, FR-034 to FR-038, and
   the "Session 2026-11-06" clarifications. Also the "Decided on 6 Nov 2026" section of
   `_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-04/brief.md`.
5. `.agents/skills/groupbasket-money-review`, `groupbasket-cart-concurrency`,
   `groupbasket-access-review` (each `SKILL.md`).
6. Code to reuse, not copy:
   - `src/server/returns.ts` (the `locked`, `move`, `queue` and message helpers);
   - `src/server/quality.ts` (`removeFactory`, `cleanProducts`, `hideProduct`);
   - `src/server/cancellations.ts`;
   - `src/server/carts/service.ts` (`sweep`, `close`, `removeHiddenProductLines`);
   - `src/server/carts/locks.ts`, `src/server/carts/confirmation.ts`;
   - `src/server/agreements.ts` (`canSellIn`);
   - `src/server/tokens.ts`, `src/server/notify`.
7. `node_modules/next/dist/docs/` before pages or actions.

## The owner's rules (approved 2026-11-06; do not change them)

- The factory answers a return within **24 hours**. If it doesn't, the return goes to an admin. A
  missed deadline is not a fault.
- Factory **and** FACTORY/CORE admins are notified at filing. Admins can view the return at once but
  decide only after a refusal or a timeout.
- A fault is each item of a factory-fault return that the factory or an admin **accepts**. Buyer
  fault never counts.
- **2 faults within 12 months put the factory on hold:**
  - listings are hidden at once;
  - open-cart items are removed;
  - finished but unpaid carts are cancelled, with applied tokens returned and no new tokens;
  - paid carts not yet booked with PickMe are cancelled, with full-price tokens;
  - **carts booked with PickMe (`DISPATCHED`) or delivered are never touched.**
- A removal uses the same cart clean-up.
- An ordinary product hide only affects OPEN/READY carts.
- During a hold, the factory can't sell but can still answer returns. The admin and the owner talk
  in a private hold thread. The admin then decides Continue (only this hold's hidden listings come
  back) or Remove.
- Faults keep counting after Continue.
- An admin can cancel a mistaken fault, with a note.
- The owner sees the factory's faults.

## Constraints

- **Tests first:** write each task's tests first and watch them fail.
- **No new dependencies.** Make no `gb_ai_reader` grants. Run the restricted-reader refusal check on
  `FactoryFault`, `FaultHold` and `FaultHoldMessage`.
- **Stage by path.** Never use `git add -A`. Make one commit per plan task (5 commits), each ending
  with your `Co-Authored-By` line. Commit this prompt file with Task 1.
- **Commands:** run `npm run check`, `npm run test:int`, `npm run build` and
  `npx prisma migrate status`. Then run `GROUPBASKET_E2E=1 npx next build` followed by
  `CI=1 npm run e2e` (the full suite). All must pass. Then run `git push origin main`.
- **Not allowed:** force-push, amending pushed commits, deploying, production data, secrets, or
  branch resets.

## Report

- Commit hashes and the push result.
- Each command's summary, with test counts.
- Every existing test you changed because of the new hide rule, and why.
- The lock structure for recording a fault, `enforceHold` and `decideHold`.
- The refusal check results.
- Any deviation from the design or plan, and why.
