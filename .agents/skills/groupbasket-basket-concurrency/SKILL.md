---
name: groupbasket-basket-concurrency
description: Review GroupBasket basket joins, payment notices and the daily sweep for lock order, no overfilling and exactly-once effects.
---

Read `AGENTS.md` and `.claude/agents/groupbasket.md` first.

Rules to check:

- **Lock order:** the `PaymentAttempt` row (`lockAttempt`), then the `PackGroup` row (`lockGroup`), never the other way round.
- **Notices:** `handleNotice` locks the attempt; `expireHolds` in the sweep does the same before releasing a spot.
- **Held spots:** a held (unpaid) spot counts in `joined`, so two buyers can never take the last spot.
- **Duplicates:** `@@unique([groupId, userId])` refuses a second spot.
- **Basket states:** a basket is `PENDING` until its owner pays, and a failed owner payment deletes it. It becomes `FULL` and creates one `PackDelivery` when every spot is paid.
- **Exactly once:** gateway events are deduplicated by `PaymentEvent (gateway, eventId)`, and token credits by `eventKey`.
- **Sweep:** it extends a due basket at most twice, then closes it and refunds every paid spot. Each basket runs in its own transaction, so one failure doesn't stop the rest.

Run `npm run test:int` (`packs`, `payments`, `tokens`) and add a race test for any new mutation. Report the lock path you inspected and the evidence.
