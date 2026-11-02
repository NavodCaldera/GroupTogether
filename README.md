# GroupBasket

Business model and current rules: [main agent brief](.claude/agents/groupbasket.md).
For code coverage and planned features, see [implementation status](docs/implementation-status.md).

Group buying for clothing and apparel. Targets the main clothing business with factory-surplus and B-grade clothes as a sub-part (shoes/footwear are not targeted). Shoppers share carts to reach the
LKR 50,000 minimum order. The cart owner pays the whole cart by bank transfer, and the order
arrives in one PickMe drop.

## Run it locally

```sh
npm install
cp .env.example .env
npm run db:start      # local PostgreSQL on 5546 (dev) and 5547 (test)
npx prisma migrate deploy
npm run db:seed       # demo data, password "password123"
npm run dev           # http://localhost:3002
```

Demo accounts:

- `premium@groupbasket.lk`, `factory@groupbasket.lk` and `warehouse@groupbasket.lk`, one
  admin per area.
- `buyer@example.com` (Dilan), `buyer2@example.com` (Sachini) and `buyer3@example.com`
  (Tharindu), the buyers. `seller@example.com` is the factory seller.

## Operational admin accounts

There is no main admin. Every admin belongs to one area (**Premium brands**, **Factory
apparel** or **Warehouse and delivery**) and runs that whole stream, including its own users
and settings. Apply pending migrations with `npm run db:deploy`; former unrestricted admin
accounts become warehouse admins. Create a deployment's first admin for each area with:

```bash
npm run admin:create -- PREMIUM "Name" email@example.com 0771234567   # or FACTORY / WAREHOUSE
```

It prints a temporary password. After that, each area adds its own admins in
**Admin > Users > Add admin**. Factory sellers, premium brands and packing staff keep their
existing workspaces.
Buyers reach pre-purchase design samples from the dashboard; the group owner requests and
accepts transport costs, and warehouse operators record sample dispatch and delivery.
No additional connector or dependency is required for these manual operations.

## Before going live

- **Bank details:** enter them in Admin → Settings. Cart owners see them on the payment page.
- **PickMe:** apply for a PickMe business (Flash) account to get the API docs and keys.
  - Until then, keep `DELIVERY_PROVIDER=manual`. The admin books each trip in the PickMe app and
    enters the details.
  - Once you have them, set `DELIVERY_PROVIDER=pickme` and the `PICKME_*` variables. Then map the
    real request fields in `src/server/delivery/provider.ts` and
    `src/app/api/webhooks/pickme/route.ts`.
- **Cron:** call `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` every 5 minutes,
  so expiry processing and in-app notices run on time. Deadlines also take effect whenever a page loads.
- **Hosting:** not chosen yet. Bank slips and photos are stored on local disk (`STORAGE_DIR`). On
  serverless hosting, swap `src/server/storage/local.ts` for object storage.

## Tests

Development assistant skills, MCP setup, CI, security checks and upstream provenance:
[development tooling](docs/development-tooling.md). Repository skills load on the next
Codex turn/session; configured MCP servers must appear in the client's actual tool inventory
before an assistant may claim access.

To preview all premium brand dashboard states without resetting existing local data:

```sh
node scripts/seed-brand-demo.mjs
```

Sign in as `brand@example.com` with `password123` and open `/seller`. Fixtures are labelled Demo. This command is additive and restricted to the local development database; the regular `db:seed` command resets data.

```sh
npm run check      # typecheck, lint and unit tests
npm run test:int   # integration tests: stock locking, deadlines, slips, delivery
npm run e2e        # browser journeys
```

Additional checks and local tools:

```sh
npm run check:money     # selected monetary hazards and Decimal(14,2) mappings
npm run check:docs      # local file links in repository guidance
npm run test:tooling    # test database and inspector boundary regressions
npm run e2e:mobile      # 360 px accessibility and role-workspace smoke checks
npm run browser -- --help
npm run mcp:verify      # Next.js DevTools handshake
```

Tests require the disposable loopback database `groupbasket_test`; test setup resets it.
The development database and read-only MCP reader are never test targets. GitHub Actions
runs checks, a production build, integration tests and browser tests against disposable
PostgreSQL. A separate workflow audits dependencies and scans local Semgrep rules.
