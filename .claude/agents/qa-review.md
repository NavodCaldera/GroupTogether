---
name: qa-review
description: "Verify GroupBasket changes against stable business rules, access boundaries and relevant automated/browser coverage."
---

# Qa Review

## Read first

Follow [repository instructions](../../AGENTS.md), then the
[operating brief](groupbasket.md). Check [implementation status](../../docs/implementation-status.md)
for capabilities, [decisions](../../docs/decisions.md) for unresolved policy and
[architecture](../../docs/architecture.md) for technical context. This file owns domain
guidance, not business policy. Verify code pointers before editing.

## Ownership and evidence

Choose checks from the changed behavior and report exactly what ran. The operating brief
defines expected policy; implementation status distinguishes existing code from planned
capabilities. Static inspection, passing tests and deployment readiness are separate claims.

## Review by affected domain

| Change                 | Review focus                                                                                                                      | Existing coverage                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Orders/baskets/stock   | Lock order, atomic hold/sell/release, one open basket, lock amount and maximum wait, cancel before lock, pickup-code throttle     | agent-money, order-rules, agent-rules unit tests; checkout, baskets, handover, returns integration tests |
| Payment/tokens/payouts | Verified notice only, duplicate/forged/mismatched/late notices, fee rounding, no cash back, append-only ledger, payout cutoff     | payments demo unit test; payments, tokens, token-transfer, payouts integration tests                     |
| Agents                 | 2 km clash, deposit, status gates after LEFT, suspension locking baskets, leaving and losses                                      | agents, agent-access, admin-screens integration tests; agent browser journey                             |
| Packing/courier        | Basket moves, Packing sees no money, admin-only booking, no courier repay, missing-item hold/removal/dismiss                      | delivery, factory-fulfilment, factory-screens integration tests; factory browser journey                 |
| Catalogue/factories    | Free-stock visibility, hidden condition fields, commission snapshot, factory-scoped data, quality and fault holds                 | Taxonomy/price unit tests; admin, seller, commission, quality, fault-holds integration tests             |
| Brand rewards          | Immutable revisions, approved terms preserved, capacity locks, recipient snapshots, paid-only dispatch, duplicate-safe settlement | Brand/gift unit tests; brands, gifts integration tests                                                   |
| Communication          | Return/hold thread privacy, brand isolation, internal-note privacy, per-user read state, retries/deduplication                    | returns, fault-holds, brand-communications integration tests                                             |
| UI/role navigation     | 360 px, keyboard access, most important item first, correct role home, scoped data, redirect-safe success                         | buyer, agent, factory, admin-workspaces and accessibility browser specs                                  |

Integration files are under `tests/integration/*.int.test.ts`; unit tests are adjacent
under `src/**/*.test.ts`. Browser journeys live under `tests/e2e/`. Inspect current test
names/fixtures instead of relying on historical scenario counts.

## Cross-domain checks

- Recheck state/authorization under locks, not only before transactions. Look for non-atomic stock changes and inconsistent lock order.
- Use Decimal for money and existing formatters for display.
- Enforce protected page/action/route access and query scoping. Restrict agent, return and report photos to their authorized viewers, buyer details from factories and agents, and money from factory Packing.
- Notices are in-app, after commit; retryable brand events are persisted transactionally. GET/prefetch must not trigger brand read markers.
- Configurable defaults are not fixed policy. Gift thresholds/households remain open; no automatic host gift or implied exact-fit promise.
- Cash goes only to factories (weekly payouts); buyers and agents get tokens only. Premium gift reconciliation is parked.
- Preserve hidden stock-type/defect UI and the no-cash-back rule. Do not restore group carts, slips, lots, samples, owner chat, B-grade badges or footwear targeting.
- Avoid N+1 queries, over-fetching and unnecessary client dependencies. Preserve existing unrelated changes.
- Never weaken a test just to make it pass. Check the rule and explain whether a failure is pre-existing, a regression or an unresolved requirement.

## Commands and database precautions

- CI is defined in `.github/workflows/ci.yml` and `security.yml`. It uses disposable PostgreSQL, synthetic browser fixtures, pinned actions, dependency auditing and local Semgrep rules. A workflow file does not prove a GitHub run passed or branch protection is enabled.
- `npm run check` includes `check:money`, `test:tooling` and deterministic monetary property tests. These complement the lifecycle and access integration suites.
- `npm run e2e` includes desktop journeys and 360 px accessibility/workspace smoke checks. `npm run e2e:mobile` selects the latter only; it does not run every purchasing journey on mobile. Axe covers only automated accessibility checks.

- Documentation-only changes: installed Prettier plus local link/anchor/path checks. No database reset or application test run is needed.
- Code changes: `npm run check` runs typecheck, lint and unit tests.
- Database/service changes: run relevant integration coverage through `npm run test:int`; inspect runner configuration for file filtering and execution behavior.
- Changed user flows: run relevant Playwright coverage through `npm run e2e`.
- Database setup uses `npm run db:start`. Tests use the isolated test database; it must never equal the development database URL. Review test/global setup before running reset/seed operations.
- Integration helpers live in `tests/integration/helpers.ts`. Pass explicit time where supported; assert notification effects when behavior requires them.
- Check browser configuration/build directories before running alongside a developer server. E2E setup seeds the test database; it is not harmless against valuable data.

Report checks, outcomes and material unverified behavior. Update implementation status only
when evidence changes; documentation cleanup alone does not establish new capabilities.

## Login rate limiting

`AUTH-001` in the [operating brief](groupbasket.md) governs password lockout.
`tests/integration/login-lockout.int.test.ts` covers success cleanup, fifth-failure lockout,
expiry (including the exact boundary), unknown-email parity, concurrent failures, email
normalisation, administratively locked users and pool availability during 30 concurrent
verifications (an unrelated query must finish in under 200 ms). Check that active locks skip password
verification and do not change their deadline. Password verification must hold no transaction,
connection or advisory lock. The atomic failure upsert resets expired locks and preserves
active deadlines, including for attempts already past the initial check. Such in-flight attempts
may finish checking after the fifth failure; this burst trade-off is accepted. Failure writes must finish before an
`AuthError` is thrown. `LoginAttempt` contains private email identifiers; never grant it
to `gb_ai_reader`.
