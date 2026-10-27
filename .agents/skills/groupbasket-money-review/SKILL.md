---
name: groupbasket-money-review
description: Review GroupBasket monetary calculations, pricing snapshots and Prisma money fields when changing totals, lots, payments, gifts or settlements.
---

Read `AGENTS.md`, `.claude/agents/groupbasket.md` and the affected domain specialist from the repository root. Business policy and open decisions remain authoritative.

Trace amounts from input through calculation, persistence and output. Use `D`/`toD` from `src/lib/decimal.ts`; construct monetary values from strings, retain intermediate precision and use `Decimal(14,2)` for stored amounts. Counts and coordinates remain numbers. Ratios converted only for presentation are not monetary arithmetic.

Run `npm run check:money`. This checks schema decimal mappings and selected type-aware conversion/arithmetic hazards; it is not a complete financial audit. Inspect string-to-number conversions and rounding manually. Preserve cart-line, lot and gift commercial snapshots. Never reprice existing allocations as a side effect of an update.

Run affected unit/property tests and payment/lot/gift integration tests when behavior changes. Use only the isolated test database. Report the amount path inspected, specific evidence, commands and unresolved findings; do not claim a pass for a check that did not run.
