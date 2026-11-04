<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## GroupBasket repository instructions

Use **GroupBasket** in business references and `groupbasket` in technical names. Clothing
and apparel are primary; factory surplus and B-grade clothing are secondary. Shoes and
footwear are excluded. The [operating brief](.claude/agents/groupbasket.md) owns full policy.

### Read order and authority

1. Follow this file for repository workflow and engineering standards.
2. Read the [operating brief](.claude/agents/groupbasket.md) for business intent and stable rule IDs.
3. Check [implementation status](docs/implementation-status.md) before claiming a capability exists.
4. Consult [decisions](docs/decisions.md) when the task depends on unresolved policy. Check existing session decisions first; continue independent work while clarification is pending.
5. Read the relevant specialist below and [architecture](docs/architecture.md) for code context. Verify technical details against the current source.

Explicit task instructions apply subject to system and developer instructions. Specialist
notes, legacy code and dated changelog entries cannot override approved business policy.
Implemented behavior and approved requirements are separate facts. Examples are not
defaults or commercial commitments.

### Specialist routing

These files describe areas of responsibility; use the references needed for the task.
Their presence does not require spawning agents.

| Specialist                                           | Owns                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| [groupbasket](.claude/agents/groupbasket.md)         | Business model, scope, roles and policy across domains                            |
| [backend-data](.claude/agents/backend-data.md)       | Schema, migrations, data access and seed fixtures                                 |
| [catalogue-admin](.claude/agents/catalogue-admin.md) | Clothing catalogue, stock, lots, factory offers/designs and general admin         |
| [carts](.claude/agents/carts.md)                     | Shared carts, reservations, deadlines, discovery and merging                      |
| [payments-slips](.claude/agents/payments-slips.md)   | Bank evidence, review and clothing payment transitions                            |
| [packing](.claude/agents/packing.md)                 | Factory stock receipt, gathering, packing and handover                            |
| [delivery](.claude/agents/delivery.md)               | Clothing delivery booking, outcomes, providers and rebooking                      |
| [brands-rewards](.claude/agents/brands-rewards.md)   | Premium submissions/reviews, gift reservations, direct fulfilment and settlements |
| [notifications](.claude/agents/notifications.md)     | In-app notices, owner chat and partnership communication                          |
| [frontend](.claude/agents/frontend.md)               | Shared UI, role navigation, accessibility and mobile interaction                  |
| [qa-review](.claude/agents/qa-review.md)             | Verification scope, access boundaries and regression checks                       |

### Engineering standards

- Repository skills live in `.agents/skills/`. Apply `groupbasket-money-review`, `groupbasket-cart-concurrency`, `groupbasket-access-review` and `groupbasket-browser-review` when their scopes apply. Vendor skills supplement these rules; they do not override installed framework documentation or business policy. Claude Code reaches the same skills through pointer files in `.claude/skills/`; edit only `.agents/skills/`. Tooling setup and provenance live in [development tooling](docs/development-tooling.md).

- Read relevant installed Next.js guides before framework code, as required above.
- Prioritize speed and low running cost: server rendering, system fonts and small client islands. Avoid heavy UI libraries, paid services and always-on workers unless specifically authorized.
- Money uses database `Decimal(14,2)` and `D`/`toD` from `src/lib/decimal.ts`; do not calculate it with JavaScript `number`.
- Pure domain rules belong in `src/lib/`; mutations belong in server services. Cart mutations use transactions and cart-row locks; preserve the per-user active-cart lock. Notify after successful transaction completion. Persist retryable brand business events within their transaction and deliver notices after commit.
- Protected pages, actions and routes enforce appropriate roles. Enforce commercial visibility in server queries and mutations as well as the interface.
- Select only needed fields, avoid N+1 queries and reuse the existing database pool.
- Setup and commands live in [README.md](README.md) and [package.json](package.json). `db:migrate` also regenerates Prisma. Seed resets demo data; do not run it against valuable data as a routine check.
- Validate proportionately: formatting and links for documentation; relevant rule/integration tests for lifecycle, stock, payment or access changes; browser journeys for affected flows. Run required code checks for code changes and report what actually ran.
- `npm run check` also runs monetary structural checks, tooling safety tests and monetary property tests. Test entry points require a loopback `groupbasket_test` database and reject the same development database even when credentials or URL spelling differ. The development inspector is separate, fixed to `localhost:5546/groupbasket`, and must use the verified read-only role.
- Format touched files with installed Prettier and preserve unrelated changes. These instructions do not authorize committing, pushing, deploying, resetting data or making external commercial commitments.

### Documentation maintenance

Update each fact in its authoritative home:

| Fact                                                         | Home                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Repository workflow and shared engineering standards         | This file                                              |
| Business policy and stable rule IDs                          | [Operating brief](.claude/agents/groupbasket.md)       |
| Implemented capabilities, evidence and gaps                  | [Implementation status](docs/implementation-status.md) |
| Unresolved policies and legacy rule mapping                  | [Decisions](docs/decisions.md)                         |
| Lifecycle, schema relationships, routes and service map      | [Architecture](docs/architecture.md)                   |
| Domain code pointers, implementation guards and verification | Relevant specialist                                    |
| Setup and executable commands                                | [README](README.md), [package.json](package.json)      |
| Historical requested changes                                 | [Changelog](docs/CHANGES.md)                           |

Record requested changes in the changelog and update affected policy, status and specialist
references together. Keep rule IDs stable. Use IDs and named topics rather than old rule
numbers or section positions. Historical alternatives belong in the changelog, not appended
as active instructions. `CLAUDE.md` and `.agents/rules/product-focus.md` are entry points,
not independent policy lists.
