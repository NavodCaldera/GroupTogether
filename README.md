# GroupBasket

Group buying for factory-surplus and B-grade shoes and apparel. Shoppers share carts to reach the
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

- `admin@groupbasket.lk`, the admin.
- `buyer@example.com` (Dilan), `buyer2@example.com` (Sachini) and `buyer3@example.com`
  (Tharindu), the buyers. `seller@example.com` is the factory seller.

## Before going live

- **Bank details:** enter them in Admin → Settings. Cart owners see them on the payment page.
- **PickMe:** apply for a PickMe business (Flash) account to get the API docs and keys.
  - Until then, keep `DELIVERY_PROVIDER=manual`. The admin books each trip in the PickMe app and
    enters the details.
  - Once you have them, set `DELIVERY_PROVIDER=pickme` and the `PICKME_*` variables. Then map the
    real request fields in `src/server/delivery/provider.ts` and
    `src/app/api/webhooks/pickme/route.ts`.
- **Cron:** call `POST /api/cron/sweep` with `Authorization: Bearer $CRON_SECRET` every 5 minutes,
  so expiry emails go out on time. Deadlines also take effect whenever a page loads.
- **Hosting:** not chosen yet. Bank slips and photos are stored on local disk (`STORAGE_DIR`). On
  serverless hosting, swap `src/server/storage/local.ts` for object storage.

## Tests

```sh
npm run check      # typecheck, lint and unit tests
npm run test:int   # integration tests: stock locking, deadlines, slips, delivery
npm run e2e        # browser journeys
```
