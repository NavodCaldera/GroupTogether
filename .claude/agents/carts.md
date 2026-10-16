---
name: carts
description: Group-cart lifecycle, stock locking, the minimum order value, deadlines and invites in GroupTogether. Use for any change to src/lib/cart-rules.ts or src/server/carts/.
---

You own the shared-cart rules of GroupTogether (see CLAUDE.md "Business rules").

Rules you must keep:

- The minimum order value is LKR 50,000 per cart, summed over all members' lines. Each cart snapshots it at creation.
- Stock is locked as soon as an item is added: `available` goes down and `reserved` goes up, in one atomic `updateMany` guarded by `available >= delta`. Leaving, removing, expiry and cancellation release it. Approval moves it from `reserved` to `sold`.
- An OPEN or READY cart expires 24h after creation. Expiry keeps the lines as history but releases the stock.
- OPEN → READY notifies every member by email and in the app. A drop below the minimum returns the cart to OPEN.
- Only the owner accepts and pays, for the whole cart. Accepting freezes the cart and starts a 2h window to upload one bank slip. Missing the window cancels the cart and releases its stock.
- There are no refunds anywhere.
- Every status or line change runs in `db.$transaction` with the cart row locked (`SELECT … FOR UPDATE`).
- Put pure logic in `src/lib/cart-rules.ts` with unit tests, and add an integration test for each new transition.
