# Development tooling

Configured on 2026-10-27. This file records setup and upstream provenance, not business policy.
Follow [AGENTS.md](../AGENTS.md) and the [operating brief](../.claude/agents/groupbasket.md).

## Installed repository skills

Codex discovers `.agents/skills/` on a subsequent turn/session. The four project skills cover
money, cart concurrency, role/data boundaries and browser verification. They reference the
canonical rules rather than creating new commercial requirements. Skill instructions do not
prove a check ran: report actual commands and results.

Selected upstream skills were installed using the bundled Codex skill installer:

| Source                                                                  | Revision                                   | Installed paths                                               |
| ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| [Prisma skills](https://github.com/prisma/skills)                       | `ba3f9d73200bbb62e49733ab93a961fd138a2c18` | `prisma-client-api`, `prisma-cli`                             |
| [Vercel skills](https://github.com/vercel-labs/agent-skills)            | `063bee94c3f4df8453406c830b0a7df0f2860278` | `skills/react-best-practices`, `skills/web-design-guidelines` |
| [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) | `b1a5903c5b633b8c9f843ad7b629c2a78437040c` | `skills/playwright-cli`                                       |

Keep upstream provenance and license notices when updating. Vendor references to unavailable
skills/tools are not installed capabilities; use official documentation or stop that dependent
operation. Prisma 7 guidance must not silently upgrade this project or provision cloud databases.
Vercel UI guidance supplements existing tokens and primitives. Web guidelines may fetch public
upstream guidance; never send private records to a documentation service.

## MCP processes

[`.codex/config.toml`](../.codex/config.toml) configures local servers using pinned
packages from `package-lock.json` and Context7 through its official hosted endpoint. Launch Codex from the repository and trust its project
configuration through the supported client. No global MCP configuration is overwritten.
See [official Codex MCP setup](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

- **Next.js DevTools:** enabled. `npm run mcp:verify` tests the stdio handshake. `npm run dev`
  starts the app on 3002; runtime diagnostics require the running app. Installed Next.js guides
  in `node_modules/next/dist/docs/` remain authoritative. Browser work uses the separate CLI.
- **PostgreSQL inspector:** enabled after local reader verification; other clones need the setup below. `scripts/postgres-inspector.mjs`
  fixes host/port/database/user to `localhost:5546/groupbasket` and `gb_ai_reader`, exposes only
  `query`, forbids runtime connection overrides and refuses write-capable/privileged roles.
  Queries pass through the third-party inspector's read-only transaction/statement controls.
  Local process startup and query results enter the assistant context; local execution does not
  mean model-visible data stays exclusively on the computer.
- **Context7:** enabled through `https://mcp.context7.com/mcp`. The hosted transport replaces
  the Windows subprocess that emitted a shutdown assertion; its unused package is removed.
  `npm run mcp:verify -- context7 --lookup` checks the handshake and requires actual library IDs
  from a public Decimal.js lookup, followed by clean shutdown. This passed without an API key.
  For account-specific quota, set `CONTEXT7_API_KEY` and uncomment `bearer_token_env_var` in
  the config; never commit a key. It sends documentation questions to Context7; never send
  application secrets, private code or customer data. External free/paid account limits may change.

Successful subprocess handshakes do not add tools to an already-running assistant session.
Refresh the supported local client and verify its actual MCP tool list.

On 2026-10-27, the current session's actual Next.js and PostgreSQL tools were exercised:
Next.js discovered the app on port 3002 and returned no configuration/session errors;
PostgreSQL reported `gb_ai_reader`, database `groupbasket`, read-only transactions, and denied
direct access to `public."User"`. Context7's new transport requires a client refresh to mount.

### Claude Code

Added 2026-11-05. Claude Code reads skills from `.claude/skills/` and project MCP servers from
[`.mcp.json`](../.mcp.json). Each repository skill has a pointer in `.claude/skills/<name>/SKILL.md`
with the same header, sending the reader to `.agents/skills/<name>/SKILL.md`, which stays the only
copy of the instructions; `tests/tooling/claude-skill-pointers.test.mjs` fails on drift.
`.mcp.json` starts the same three servers as `.codex/config.toml` with the same pinned packages and
no keys; Claude Code asks for approval before first use. `.mcp.json` has no tool allowlist, so each
MCP tool call asks for approval unless the owner adds permission rules for exactly the tools Codex
enables. Context7 questions must be public library questions only: never code, records, IDs or
secrets.

### Restricted local database reader

`npm run mcp:setup-reader -- --apply` is explicit administrative setup, separate from inspection.
It requires the development URL to target localhost port 5546 and database `groupbasket`.
It creates a new restricted role, sets read-only/timeout defaults, creates three sanitized
views in `groupbasket_ai` and writes a generated password to ignored `.env.mcp` without printing it.
It changes no application rows and refuses existing role/config/schema conflicts rather than
overwriting access. Keep this local credential file private, including Windows file permissions.

The role receives SELECT only on `groupbasket_ai.schema_columns`, `stock_summary` and
`cart_summary`; no blanket access to user profiles, slips, private messages, partner terms or
application tables. Schema inspection exposes column types; operational views expose aggregates.
Do not grant new tables by default when migrations introduce sensitive fields.

After setup, run `npm run mcp:verify -- postgres`, verify denial on direct `public."User"`
access and then enable the postgres entry in `.codex/config.toml`. Failure means leave it disabled.
Never use the development application's privileged connection as a substitute for inspection.

## Executable verification

- `npm run check`: typecheck, ESLint, monetary structural guard, local documentation-file links, seven tooling safety tests,
  and unit/property tests. `check:money` checks all Prisma Decimal fields for `(14,2)` and
  selected type-aware arithmetic/conversion hazards. It cannot identify every monetary string,
  float calculation, unsafe rounding or wrongly scoped query; use the project skills and tests.
- Monetary property tests compare totals against an independent integer-cent model with fixed
  seeds. Existing PostgreSQL race, active-cart, merge and gift tests verify database behavior.
- All integration/browser setup uses `scripts/test-database.mjs`. It accepts only loopback
  `groupbasket_test`, rejects equivalent development targets and never prints credentials.
  Local test port is 5547; CI uses its disposable 5432 service. Test operations are intentionally
  write-capable and destructive only in that isolated database.
- `npm run e2e`: existing desktop journeys plus desktop/mobile accessibility smoke checks.
  Mobile project is limited to the smoke spec so stateful seeded journeys are not rerun on
  already-consumed fixtures. Each serial spec re-seeds its own test fixtures, keeping brand
  checkout independent of buyer journeys. CI uses the production build; local runs use the
  isolated development build. `e2e:mobile` selects 360 px smoke coverage.
- `npm run browser -- --help`: pinned interactive Playwright CLI, with its repository skill.
  Use synthetic fixtures. Browser state, reports, traces and screenshots stay ignored.

## GitHub automation and connections

CI runs on main pushes, PRs and manual dispatch. It uses Node 24, disposable PostgreSQL 18,
read-only repository permissions, pinned action commits, a production build and automated tests.
Only synthetic browser diagnostics are retained, for seven days after failure. It does not deploy.

Security CI runs `npm audit --audit-level=high` and Semgrep 1.182.1 with only local rules,
metrics/version checks disabled. Rules detect unsafe raw SQL in app source and direct database/
session imports into client modules; they do not prove authorization or isolation. Dependabot
opens weekly npm/action updates, caps npm PRs and leaves major upgrades for explicit review.
Dependency overrides patch DevTools MCP's SDK/Zod and fast-uri; retain handshake/audit checks
when updating them. Branch protection must be verified separately on GitHub.

The GitHub app plugin requires installation/account authorization in the client. Authenticated
GitHub CLI can publish and inspect CI independently, but does not install that plugin. Limit
connector access to this repository where supported. Figma remains conditional on an authorized
design file/account; no designs or customer records are uploaded automatically. CodeQL is not
enabled without checking private-repository entitlement; Semgrep provides a local-rules baseline.
No paid Context7, Semgrep, GitHub Code Security or Figma subscription is purchased by this setup.

## Pilot acceptance checks

Compare review corrections, task time and tool usage on a monetary change, last-unit race,
cross-brand denial, mobile payment journey and runtime failure. Record baseline and assisted
results before claiming a percentage improvement. CI runs and handshake results are evidence
for their specific checks, not proof of production readiness.
