---
name: groupbasket-cart-concurrency
description: Review GroupBasket cart creation, joining, reservations, merges, expiry and payment mutations for transactional stock and single-active-cart invariants.
---

Read `AGENTS.md`, `.claude/agents/carts.md`, `.claude/agents/backend-data.md` and relevant rules in the operating brief. Mutations live in `src/server/carts/`, not `src/lib/services/`.

Trace every changed mutation through its transaction. Check state/deadlines again after locking. Preserve cart-row locks, per-user advisory locks around active-cart decisions, guarded available-to-reserved updates and deterministic cart lock ordering during merges. A transaction alone does not prevent overselling. Per-user locks are not required on unrelated transactions.

Preserve reservations while merging; release them on the permitted close/remove/leave paths. Preserve gift reservation hooks and captured prices. Notices follow commit; retryable brand business events are persisted inside the transaction.

Use the existing race and single-active-cart cases in `tests/integration/carts.int.test.ts` and merge/gift integration suites. Add a focused race regression when a changed path is not covered. Run `npm run test:int -- <affected files>` against the guarded disposable test database. Never test writes through the read-only development inspector. Report lock order, invariant evidence and actual results; static inspection does not prove concurrency safety.
