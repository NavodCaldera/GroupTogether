---
name: groupbasket-money-review
description: Review GroupBasket monetary calculations, pricing snapshots and Prisma money fields when changing order totals, PayHere fees, baskets, payouts, tokens, deposits or gifts.
---

Read `AGENTS.md`, `.claude/agents/groupbasket.md` and the affected domain specialist from the repository root. Business policy and open decisions remain authoritative.

Trace amounts from input through calculation, persistence and output. Use `D`/`toD`/`roundMoney` from `src/lib/decimal.ts` and the pure rules in `src/lib/agent-money.ts`; construct monetary values from strings, retain intermediate precision and use `Decimal(14,2)` for stored amounts. Counts and coordinates remain numbers. Ratios converted only for presentation are not monetary arithmetic.

Run `npm run check:money`. This checks schema decimal mappings and selected type-aware conversion/arithmetic hazards; it is not a complete financial audit. Inspect string-to-number conversions and rounding manually. Preserve order-line `unitPrice`/`factoryPrice` snapshots, the listing commission snapshot and parked gift snapshots. Never reprice existing orders as a side effect of an update. Check the PayHere fee (`round2(remainder / (1 − rate) − remainder)`, 0 when the remainder is 0; LKR 1,000 + 40 + 20 at 0.033 → 36.17, total 1,096.17), refunds as tokens only, and that cash goes only to factories through weekly payouts.

Run affected unit/property tests (`agent-money`) and checkout, payments, tokens, token-transfer, payouts, returns and gifts integration tests when behavior changes. Use only the isolated test database. Report the amount path inspected, specific evidence, commands and unresolved findings; do not claim a pass for a check that did not run.
