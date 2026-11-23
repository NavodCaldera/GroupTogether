# GroupBasket

Family packs from the companies you know, bought together with families near you. The business
rules are in the [operating brief](.claude/agents/groupbasket.md), and the code map is in
[architecture](docs/architecture.md).

## Run it locally

You need Node 24 and PostgreSQL. `npm run db:start` runs local servers on ports 5546 (development)
and 5547 (tests) where its binaries exist; otherwise use your own PostgreSQL on those ports.

```sh
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed       # demo data; wipes the database first
npm run dev           # http://localhost:3002
```

Every demo buyer's password is `password123`:

- `buyer@example.com` (Dilan) has two Hemas baskets nearby, his contact Nimali's first.
- `buyer3@example.com` (Tharindu) lives in Wellawatte with no basket nearby, so he can start one.

Payments use the demo gateway (`PAYMENT_GATEWAY="demo"`): its page has Pay, Fail and Cancel.

## Commands

| Command             | Does                                                              |
| ------------------- | ----------------------------------------------------------------- |
| `npm run check`     | Money checks, doc links, types, lint, tooling tests, unit tests   |
| `npm run test:int`  | Integration tests on `groupbasket_test`                           |
| `npm run e2e`       | Browser tests, desktop and 360 px mobile                          |
| `npm run build`     | Production build                                                  |
| `npm run dev:phone` | HTTPS dev server for a phone on the same Wi-Fi (`DEV_PHONE_HOST`) |

## Running it

- **Daily job:** call `POST /api/cron/sweep` once a day with `Authorization: Bearer $CRON_SECRET`.
- **Hosting:** not chosen yet. One small server, or serverless with a hosted PostgreSQL, both fit.
