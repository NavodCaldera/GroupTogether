---
name: backend-data
description: "Schema, migrations, seed fixtures and data access for GroupBasket. Use for Prisma, database configuration and persistence changes."
---

# Backend Data

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and code

- Schema and migrations: `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`.
- Client and settings: `src/server/db.ts` (exports `db`, `Tx`), `src/server/settings.ts`.
- Fixtures: `prisma/seed.ts`, `prisma/seed-hooks.mjs`, `src/lib/demo-accounts.ts`; local databases: `scripts/local-db.mjs`.
- Model relationships and lifecycle tables belong in [architecture](../../docs/architecture.md); do not maintain a second exhaustive model list here.

## Implementation guards

- Use `D`/`toD`/`roundMoney` for `Decimal(14,2)` money. Retain order-line price snapshots (`unitPrice`, `factoryPrice`), order money fields and the parked gift commercial/recipient snapshots.
- Maintain available/reserved/sold stock atomically: checkout reserves, a verified payment sells, expiry and cancellation release. Basket totals change in the same transaction as the order that moves them.
- Preserve the lock order in [orders-baskets](orders-baskets.md) and the database constraints: one `OPEN` basket per agent and factory (partial unique index), one pickup code per buyer and agent, unique `PaymentEvent (gateway, eventId)` and unique ledger `eventKey`. The token ledger is append-only.
- Parked gift capacity uses offer locks and non-cancelled allocations; settlement locks selected bill rows and prevents duplicate payment recording. Coordinate with [brands-rewards](brands-rewards.md).
- Brand revisions are immutable; approved terms stay active while proposals await review. Persist communication events transactionally, with per-user reads and deduplicated notice delivery. Coordinate with [notifications](notifications.md).
- Nullable gift metadata preserves older offers. Private photo storage never grants public access.
- Settings is a singleton (id 1). Its defaults (`courierPerItem` 40, `agentFeePerItem` 20, `gatewayFeeRate` 0.033, `basketLockAmount` 50000, `maxWaitDays` 60, `paymentHoldMinutes` 15, `collectHours` 48, `returnHandoverDays` 7, `agentRadiusM` 1000, `agentGapM` 2000, `agentDeposit` 200000, `commissionPerPiece` 100) are implementation settings; read them, never hard-code them in services.
- Enforce `DATA-001` in selects as well as pages. Sellers' own offer amounts/shop prices are permitted; buyer records and internal costs are restricted.

## Migrations and fixtures

- Never edit an applied migration. Name new migrations in snake_case; `npm run db:migrate` creates migrations and regenerates the client.
- Generated client output is `src/generated/prisma`; do not edit it. The development client cache detects a regenerated Prisma client class.
- Local Postgres uses ports 5546 (`groupbasket`) and 5547 (`groupbasket_test`), with data in `.data/pg`. Test and development database URLs must differ.
- The main seed clears tables. Treat fixture accounts, agents, baskets in every stage and the demo pickup code as test dependencies (`src/lib/demo-accounts.ts`); inspect the seed and browser setup before changing them.
- Demo products and test fixtures use clothing; the legacy SHOES schema enum remains for stored rows. Consult implementation status rather than copying historical fixture inventories.

## Verification and coordination

Use the repository money/concurrency/access skills under `.agents/skills/`. `npm run check:money` checks Decimal schema precision and selected type-aware hazards; it does not prove all financial paths are correct. Test entry points share `scripts/test-database.mjs`. The optional MCP inspector uses a restricted reader and sanitized views (`order_summary` replaced `cart_summary` in Task 18; an existing reader role must be set up again to get it); see [tooling setup](../../docs/development-tooling.md). Never substitute application credentials for inspector credentials.

Use [qa-review](qa-review.md) to select checks. Review migration compatibility, regenerated
types, constraints and affected integration fixtures. Coordinate stock/lifecycle schema
changes with [orders-baskets](orders-baskets.md), [payments](payments.md), [courier](courier.md),
[agents](agents.md) or [brands-rewards](brands-rewards.md). Do not reset data for documentation verification.
