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

| Change                     | Review focus                                                                                                                      | Existing coverage                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cart/stock lifecycle       | Atomic reservation, locks, minimum snapshot, configurable deadlines, one active cart, merge preservation                          | Adjacent cart/dashboard/location/distance unit tests; carts, merge, open-carts integration tests |
| Payment                    | Owner-only evidence, fresh rejection window, private files, repeat review, atomic stock/gift activation                           | carts, admin, gifts integration tests                                                            |
| Catalogue/lots/factories   | Free-stock visibility, hidden condition fields, price snapshots/history, factory-scoped insights                                  | Taxonomy/stock/design unit tests; admin, lots, seller, designs, suggest integration tests        |
| Receiving/packing/delivery | Receipt once, different gatherer/packer, no send-back after packing, booked handover, rebooking                                   | Packing unit tests; receiving, packing, admin integration tests                                  |
| Brand rewards              | Immutable revisions, approved terms preserved, capacity locks, recipient snapshots, paid-only dispatch, duplicate-safe settlement | Brand/gift unit tests; brands, gifts integration tests                                           |
| Communication              | Participant/brand isolation, internal-note privacy, per-user read state, retries/deduplication, draft preservation                | chat, messages, brand-communications integration tests; brand dashboard browser journey          |
| UI/role navigation         | Mobile usability, keyboard access, correct role home, scoped data, redirect-safe success                                          | Existing buyer and brand browser journeys; focused visual checks                                 |

Integration files are under `tests/integration/*.int.test.ts`; unit tests are adjacent
under `src/**/*.test.ts`. Browser journeys live under `tests/e2e/`. Inspect current test
names/fixtures instead of relying on historical scenario counts.

## Cross-domain checks

- Recheck state/authorization under locks, not only before transactions. Look for non-atomic stock changes and inconsistent lock order.
- Use Decimal for money and existing formatters for display.
- Enforce protected page/action/route access and query scoping. Restrict slips to uploader/admin, gift photos to authorized users, buyer details from factory sellers and unpaid recipients from brands.
- Notices are in-app, after commit; retryable brand events are persisted transactionally. GET/prefetch must not trigger brand read markers.
- Configurable defaults are not fixed policy. Gift thresholds/households remain open; no automatic host gift or implied exact-fit promise.
- One owner-paid clothing drop does not exclude separate brand gift shipments. Factory payments remain outside scope; premium gift reconciliation is separate.
- Preserve hidden stock-type/defect UI and current refund scope. Do not restore B-grade badges, footwear targeting or the old premium-stock purchase workflow.
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
normalisation and administratively locked users. Check that active locks skip password
verification and do not change their deadline. Failure writes must commit before an
`AuthError` is thrown. `LoginAttempt` contains private email identifiers; never grant it
to `gb_ai_reader`.
