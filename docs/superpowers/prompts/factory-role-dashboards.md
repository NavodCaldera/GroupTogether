You are continuing the **factory admin and factory role dashboards rebuild** in the GroupBasket repo
at the current directory, branch `main`. The owner, Navod, works with you directly. Claude Code
reviews your work afterwards.

Work through three frameworks in order: **BMAD product brief, then Spec Kit (specify and clarify),
then Superpowers (design and plan), then build.** Each stage has a gate. Don't start the next stage
until the owner has approved the current one.

## Read first (in this order)

1. Run `git pull --ff-only`. Stop and report if it fails or if the tree has changes you don't
   recognise.
2. `AGENTS.md`, `CLAUDE.md`, and `.claude/agents/groupbasket.md` (`FUL-001` to `FUL-003`, `FAC-001`,
   `FAC-002`, `SUP-001`, `RETURN-001`, `QUAL-001`, `FAULT-001`, `UX-001`).
3. `_bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-06/brief.md` and `.memlog.md`
   beside it. The Packing section is approved. Everything else is still open.
4. `docs/decisions.md` (`DEC-008`, `DEC-010` to `DEC-015`), `docs/implementation-status.md`, and
   `docs/factory-dashboard-spec.md`.
5. Code as it stands today:
   - `src/lib/factory-roles.ts`, `src/server/factory-team.ts`, `src/server/factory-dashboard.ts`,
     `src/server/factory-orders.ts`, `src/server/delivery/index.ts`, `src/server/factory-admin.ts`;
   - `src/app/seller/(workspace)/` and `src/app/seller/factory-bits.tsx`;
   - `src/app/admin/factory/` and the admin Orders booking screens;
   - `prisma/schema.prisma` (`Delivery`, `GroupCart`).
6. `node_modules/next/dist/docs/` before writing pages or actions.

## Framework locations

- **BMAD:** `.claude/skills/bmad-product-brief/SKILL.md`, `.claude/skills/bmad-review/SKILL.md`,
  `.claude/skills/bmad-help/SKILL.md`, and the `_bmad/` folder.
- **Spec Kit:** `.claude/skills/speckit-specify/SKILL.md`, `.claude/skills/speckit-clarify/SKILL.md`,
  and `.specify/`. Use `specs/002-factory-role-dashboards/`, and work on `main`, not a feature branch.
- **Superpowers:** use your own installed `brainstorming` and `writing-plans` skills. Save to
  `docs/superpowers/specs/` and `docs/superpowers/plans/`, following the existing returns files. If
  Superpowers isn't installed, say so, then follow those two files' structure.
- **Review skills:** `.agents/skills/groupbasket-*`.

## How to work with the owner

- Ask **one question at a time, in simple language, with your recommendation** and its honest
  weakness. Wait for the answer.
- Challenge contradictions. Don't invent policy, and don't re-open approved rules.
- When an answer creates a new rule conflict, analyse it read-only before asking the next question,
  using a sub-agent if you have one. Say what you did not check.
- Record each answer straight away with
  `uv run _bmad/scripts/memlog.py append --workspace _bmad-output/planning-artifacts/briefs/brief-GroupTogether-2026-11-06 --type <decision|change|override|assumption|event> --text "..."`.
  Run one append at a time, and check the result.
- Each role follows the same order: **contents, then layout with examples** such as phone-width text
  mockups. Criticise every item's placement and say why it sits where it does.

## Stage 1: finish the brief (BMAD)

Interview the owner on what's still open, in this order:

1. **Planner:** contents, then layout.
2. **Sales:** contents, then layout.
3. **Owner:** contents, then layout.
4. **Factory admin:** contents, then layout. The current page is built around the old offers and
   warehouse model. It lacks applications, returns and fault holds.
5. **DEC-012 parts:** are factory payouts on ordinary orders in this rebuild? Are inbox and chat?
   Show the owner the conflict between `DEC-012` and `SUP-001` on payouts. Use the `DEC-013` sum
   (factory price plus commission), not the spec's "sale minus LKR 100".
6. **Owner protection:** can a staff Owner lock or demote another staff Owner? Today they can
   (`src/server/factory-team.ts`). Only the main factory account is protected.
7. **Money on staff screens:** only owners see money, yet Sales and Planner edit prices. What do they
   see?
8. **Packing loose ends:** who clears a reported problem (factory Owner or FACTORY admin is assumed,
   unconfirmed)? How do staff close an order when an item can't be replaced?
9. **Design tests and likes (under Planner):** a factory tests a design with a price, buyers like it,
   and the factory decides to sew. Settle how this fits `DEC-012` drafts (stars, comments, votes,
   sizes), who can see and like a test, and how a design becomes a normal listing.
10. **Many baskets:** a limit per buyer, given that one buyer could reserve a lot of stock for 3
    days; moving items and join requests (`CART-005`); what merging does to an owned basket; gifts
    across baskets.

The 2026-11-04 layouts in `docs/factory-dashboard-spec.md` are earlier input, not approved for this
rebuild. Test each against the rule below. Some rely on paused or unbuilt features.

Then finish the brief as the skill says: audit the memlog, run `bmad-review` with the structure and
prose lenses, and run `bmad-help`.

**Gate:** the owner approves the finished brief.

## Stage 2: spec (Spec Kit)

Run specify, then clarify. Cover every approved item. Use clarify only for gaps the brief leaves
open, and put each question to the owner.

**Gate:** the owner approves the clarified spec.

## Stage 3: design and plan (Superpowers)

Run brainstorming to produce the design, then writing-plans to produce small tasks with tests first.

**Gate:** the owner approves the design, then the plan.

## Stage 4: build

Run `git pull --ff-only` again, then build the plan's tasks in order. Write each task's tests first
and watch them fail.

## Rules that bind every stage

**The approved rule for every screen:** each job has its own Home at `/seller`. The top spot is the
next thing that person can act on, never a figure or chart.

**The Packing section of the brief is approved.** Don't reopen it. It needs these rule changes:
- `FUL-001` stays: admin books PickMe. Remove Packing booking and the Small/Medium/Large choice.
- `FUL-003` gains Given to driver and Parcel is back.
- `Delivery` gains a vehicle number, and the PickMe reference becomes required on admin booking.

**In this rebuild, approved 2026-11-07:**
- **Many baskets (`CART-003`) and a 3-day lifetime (`CART-002`):** assumed for all baskets, so confirm
  that with the owner. These change buyer screens and cart services, so include them in the plan as
  their own tasks and use `.agents/skills/groupbasket-cart-concurrency`. Today's one-cart checks,
  `mergeSource`, and single-basket buyer and admin screens all assume one basket; find every case.
  Existing baskets keep their expiry dates. The `cartLifetimeHours` default and the stored setting
  both need to reach 72 hours.
- **Design tests and likes:** likes are interest only, never an order or payment.

**Do not build preorders.** `DEC-015` is **not completed and not approved policy**. Leave out placing
preorders, preorder campaigns and targets, deposits, the Preorder basket, and preorder factory
payments and debts. `PAY-001`, `PAY-003` and `SUP-001` stay as written unless the owner decides
payouts on ordinary orders. Don't add placeholder tabs or empty sections for preorders.

**Keep as they are:**
- `/seller/returns` and `/admin/factory/quality` behaviour, `RETURN-001`, `FAULT-001` and `QUAL-001`.
- Luxury brands' own dashboard at `/seller`.
- Role access in `src/lib/factory-roles.ts`, unless the owner approves a change. Enforce it on the
  server, not only in the navigation.
- Only owners see money. Don't show "owed" figures unless payouts are approved.

**Screens:** phone first, working at 360px with no horizontal scroll. No explanation or description
lines in the UI. Never show buyer names or phones to factory staff. Remove the stale "Sent for
review." message from factory Home.

**Packing photos** must be private: only that factory's Owner and Packing staff and FACTORY/CORE
admins. Check today's upload storage against `DEC-008`, and tell the owner if it isn't durable.

**Documents:** in the same commit as each change, update the rule in
`.claude/agents/groupbasket.md`, `docs/decisions.md`, `docs/implementation-status.md`,
`docs/factory-dashboard-spec.md` and `docs/CHANGES.md`, following the home-of-fact table in
`AGENTS.md`.

## Constraints

- **Stage by path.** Never use `git add -A`, because other sessions share this folder. End each
  commit message with your `Co-Authored-By` line. Make one commit per plan task, and commit planning
  files at each gate.
- **Dependencies and access:** add no new dependencies without the owner's approval. Add no
  `gb_ai_reader` grants, and run the restricted-reader refusal check on any new private table.
- **Commands:** run `npm run check`, `npm run test:int`, `npm run build`, and
  `npx prisma migrate status`. Then run `GROUPBASKET_E2E=1 npx next build` followed by
  `CI=1 npm run e2e`. Browser-check each changed screen at desktop and 360px with `playwright-cli`.
  All must pass. Then run `git push origin main`.
- **Not allowed:** force-push, amending pushed commits, deploying, production data, secrets, or branch
  resets.

## Report

- The file paths of the approved brief, spec, design and plan.
- Commit hashes and the push result.
- Each command's summary, with test counts.
- Screens checked, with widths.
- Any existing test you changed, and why.
- Any deviation from the plan, anything you skipped, and anything still open for the owner.
