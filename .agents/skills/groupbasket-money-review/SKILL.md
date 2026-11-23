---
name: groupbasket-money-review
description: Review GroupBasket money: basket prices, commission, the company's amount due, payments and token refunds, and Prisma money fields.
---

Read `AGENTS.md` and `.claude/agents/groupbasket.md` first.

Trace each amount from input through calculation, storage and output. Use `D`, `toD` and `roundMoney` from `src/lib/decimal.ts`, and `packCommission` and `packAmountDue` from `src/lib/pack-money.ts`. Build amounts from strings and store them as `Decimal(14,2)`. Counts and coordinates stay numbers.

Check that:

- a pack version's price, size and commission never change after publishing;
- a basket's `price` is the version's `pricePerFamily` less the discount for its `size` (5, 10 or 15), fixed when it starts (`sizePrice`), and every spot is paid at it;
- the company is owed `(basket price − commission) × families`, rounded per family;
- refunds are tokens only (`PACK_REFUND`, `LATE_PAYMENT`) and each is posted once per event key;
- the token ledger is append-only (a database trigger).

Run `npm run check:money`, then `npm run test` and `npm run test:int` on the isolated test database. Report the amount path you inspected, the commands you ran and anything unresolved. Never claim a pass for a check that did not run.
