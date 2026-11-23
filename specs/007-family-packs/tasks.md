# Tasks: Family Packs

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [contracts/actions.md](contracts/actions.md). Work test-first: each test task comes before its code and must fail first.

## Phase 1: Setup
- [ ] T001 Apply the data-model.md delta in prisma/schema.prisma:
  - drop `PackGroup.agentId` and `User.pickupAgentId`;
  - add owner, lat, lng, address, city, `extensions Int @default(0)` and a required `closesAt` to PackGroup;
  - add `PackMember.status HELD|PAID` and `heldUntil`;
  - add `PaymentAttempt.packMemberId String? @unique`;
  - add `PackVersion.commissionPct Decimal(5,2)` and `Company.sellerId`;
  - add the PackDelivery model;
  - add the enum values PENDING, PACK_JOIN and PACK_REFUND.
- [ ] T002 Regenerate prisma/migrations/20261126100000_family_packs/migration.sql from the origin/main schema, keeping the CHECK `groupSize BETWEEN 5 AND 15`.

## Phase 2: Foundational
- [ ] T003 [P] Add test helpers `makePack({groupSize, commissionPct})` and `makeBuyerAt(lat, lng)` in tests/integration/helpers.ts.
- [ ] T004 [P] Add `packCommission(price, pct)` and `packAmountDue(price, pct, families)` in src/lib/pack-money.ts, with a unit test in src/lib/pack-money.test.ts (10% of 150.00 = 15.00).

## Phase 3: US1, browse (P1)
- [ ] T005 [US1] Test that listings show only active published versions and the latest version, in tests/integration/packs.int.test.ts.
- [ ] T006 [US1] Make the browse services in src/server/packs.ts pass T005, including `commissionPct` being hidden from buyers.
- [ ] T007 [P] [US1] Make the pages src/app/packs/**/page.tsx match FR-002 wording: "N family packs per group" and "N items in each family pack".

## Phase 4: US2, join or start (P1)
- [ ] T008 [US2] Tests in tests/integration/packs.int.test.ts:
  - nearby within 1 km and exact version only;
  - a PENDING group is hidden;
  - a duplicate is refused;
  - a race for the last spot gives one hold;
  - an expired hold is released;
  - no pinned address is refused.
- [ ] T009 [US2] Rewrite `holdSpot` and `startGroup` in src/server/packs.ts:
  - lock order per AD-2;
  - create the `PACK_JOIN` PaymentAttempt;
  - snapshot the owner's location.
- [ ] T010 [US2] Add `confirmSpot` and `releaseSpot` in src/server/packs-payment.ts, and route the `PACK_JOIN` purpose to them in src/server/payments/notice.ts.
- [ ] T011 [US2] Update src/server/pack-actions.ts and src/app/packs/p/[pack]/page.tsx: remove the pickup picker, ask for a pinned address, show distance and redirect to the gateway.
- [ ] T012 [P] [US2] e2e test in tests/e2e/family-packs.spec.ts: the buyer joins the seeded 7/10 group, pays on the demo gateway and sees 8/10.

## Phase 5: US3, fill, extend and refund (P2)
- [ ] T013 [US3] Tests in tests/integration/packs.int.test.ts:
  - FULL creates a PackDelivery;
  - 2 extensions, then CLOSED with one `PACK_REFUND` per member (sweep run twice);
  - RECEIVED gives `amountDue = (price − commission) × families`;
  - contacts are shown only to members of a FULL group.
- [ ] T014 [US3] Add `packGroups(now)` in src/server/packs-sweep.ts and register `step("packGroups")` in src/server/sweep.ts.
- [ ] T015 [US3] Add delivery status changes and `groupContacts` in src/server/packs-delivery.ts, and include pack deliveries in the weekly payout.
- [ ] T016 [US3] Show owner and member contacts and the Received button on src/app/my-groups/page.tsx, and the seller's deliveries list under src/app/seller/packs/page.tsx.
- [ ] T017 [P] [US3] Send notifications on extended, full and refunded, through the existing notify module in src/server/notify.

## Phase 6: Polish
- [ ] T018 Rework prisma/seed-packs.ts: owners with pins near the demo buyers, no agents, and a seller per company.
- [ ] T019 Docs: DEC-030 in docs/decisions.md, plus docs/implementation-status.md, docs/CHANGES.md, CLAUDE.md and .claude/agents/groupbasket.md.
- [ ] T020 Run typecheck and the integration and e2e tests, run code review, then open the PR.

## Dependencies
- Setup comes before Foundational, which comes before US1.
- US2 needs US1's pages.
- US3 needs US2's confirmSpot.
- The [P] tasks can run alongside the others in their phase.

## MVP
US1 and US2, which cover T001–T012.
