# Quickstart: validate Family Packs

**Prerequisites:** a local Postgres with `DATABASE_URL` and `TEST_DATABASE_URL` set. Run every command from `E:\` (uppercase drive).

1. Run `npm run db:deploy`, then `npm run db:seed`.
2. Run `npm run typecheck`.
3. Run `npx vitest run --project integration tests/integration/packs.int.test.ts`. It should cover:
   - a match on the exact version within 1 km only;
   - a PENDING group hidden until the owner has paid;
   - a duplicate join refused;
   - a race for the last spot giving one hold;
   - FULL creating a delivery;
   - 2 extensions, then exactly-once refunds;
   - the payout equal to (price − commission) × families.
4. Run `npx playwright test tests/e2e/family-packs.spec.ts`:
   1. Sign in as `buyer@example.com`.
   2. Go Personal Care → Hemas → 30-day pack. The page shows a group 7 of 10.
   3. Join it and pay on the demo gateway. The group shows 8 of 10.
5. Manual check: `buyer3@example.com` has no group nearby. They start one, which no one else can see until the demo payment succeeds.
