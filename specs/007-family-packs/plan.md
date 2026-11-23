# Implementation Plan: Family Packs

**Branch**: `feature/family-packs` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)
**Input**: [spec.md](spec.md) and the [architecture spine](../../_bmad-output/planning-artifacts/architecture/architecture-GroupTogether-2026-11-23/ARCHITECTURE-SPINE.md) (AD-1 to AD-9 are binding)

## Summary
The MVP already on the branch (commit d87b5ef) uses agents and has no payment. This plan reworks it to match the spec:
- each group gets an owner location snapshot and is found within 1 km;
- a join is a held spot plus a `PACK_JOIN` payment attempt, confirmed by the verified notice;
- a group is PENDING until its owner has paid, then OPEN, FULL or CLOSED;
- the sweep extends a group twice, then refunds;
- a FULL group creates a `PackDelivery` to the owner;
- the payout is the price minus the commission percentage, after the owner confirms receipt.

## Technical Context
- **Language/Version**: TypeScript, Next.js 16 App Router, React 19
- **Primary Dependencies**: Prisma 7 (client in `src/generated/prisma`), zod
- **Storage**: PostgreSQL. One new migration on top of `20261126100000_family_packs`, which has not been merged, so it is edited in place.
- **Testing**: vitest unit and integration (`tests/integration`), Playwright e2e
- **Target Platform**: web, mobile first at 360 px
- **Constraints**: money in Decimal(14,2), append-only token ledger, lock order from AD-2, sweep only from cron
- **Scale/Scope**: about 10 new or changed files under `src/server` and `src/app`, and one sweep step

## Constitution Check
`.specify/memory/constitution.md` is an unfilled template, so the gates come from AGENTS.md:

| Gate | Status |
|---|---|
| Branch from origin/main, PR, green checks | PASS (feature/family-packs) |
| Money in Decimal with `D` and `roundMoney` | PASS (AD-8) |
| Append-only ledger, idempotent posts | PASS (AD-6) |
| Server-side enforcement and row locks | PASS (AD-1, AD-2) |
| No explanation text in the UI | PASS |
| Docs updated (CHANGES.md, implementation-status, decisions DEC-030, CLAUDE.md) | Pending, in the tasks |

Post-design re-check: no violations.

## Project Structure
```text
prisma/schema.prisma                       # pack model delta (data-model.md)
prisma/migrations/20261126100000_family_packs/migration.sql  # regenerated
prisma/seed-packs.ts                       # owners and locations, no agents
src/server/packs.ts                        # browse, nearby, holdSpot, startGroup
src/server/packs-payment.ts                # notice hook: confirm or release, open or fill
src/server/packs-sweep.ts                  # extend, close and refund, release expired holds
src/server/packs-delivery.ts               # delivery status, payout due
src/server/pack-actions.ts                 # server actions (contracts/actions.md)
src/server/payments/notice.ts              # route PACK_JOIN to packs-payment
src/server/sweep.ts                        # step("packGroups")
src/app/packs/**, src/app/my-groups        # pages
tests/integration/packs.int.test.ts        # rewritten
tests/e2e/family-packs.spec.ts             # new
```

## Complexity Tracking
None.
