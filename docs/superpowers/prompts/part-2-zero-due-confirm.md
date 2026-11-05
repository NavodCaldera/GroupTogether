You are making one owner-approved change on top of **Part 2 (commission and tokens)**, commits
`e1403dc`, `1d79988`, `cf48214`, in the GroupBasket repo at the current directory, branch `main`.
Claude Code reviews your work afterwards.

## Owner decision (2026-11-05)

When tokens cover the **whole** cart, so `amountDue` is LKR 0.00, there is **no bank slip step**.
Accepting the cart confirms it immediately, and the tokens are spent at that moment. Today the owner
would have to upload a slip for LKR 0 and an admin would have to approve it.

## Required change

- In `acceptAndPay` (`src/server/carts/service.ts`), inside the same locked transaction, compute
  `amountDue(total, lines' tokensApplied)`. If it is greater than 0, behave exactly as today.
- If it is exactly 0, confirm the cart in that transaction with **the same effects as an approved
  slip**: tokens spent (`spendCartTokens`), reserved stock moved to sold, gift orders `READY` with
  their brand events, status `CONFIRMED` with `confirmedAt`, and `acceptedAt` and delivery details
  set as today. No `PaymentSlip` row, no `slipDueAt`. After commit, send the same notices
  `approveSlip` sends: members "Group order confirmed", plus the factory fulfilment notice. Members
  should not get the "owner is paying for the whole cart" notice.
- **Do not copy the logic.** Move the shared confirmation steps out of `approveSlip` into one
  function, for example `confirmPaidCart(tx, cartId, actorId, now)` plus a shared after-commit
  notifier, and call it from both places. Keep `approveSlip`'s behaviour byte-for-byte the same.
- `spendCartTokens` currently refuses carts that are not in `SLIP_REVIEW`/`CONFIRMED`/… Allow the
  zero-due path without loosening it for anything else (for example, check the status after
  confirmation, or pass an explicit reason).
- Keep the existing lock order (`withCartTransaction`, then `lockCart`, then ledger users).
- On the cart page and the pay page, the owner sees the cart as confirmed. There is no "Pay LKR 0"
  screen. If someone opens `/c/[code]/pay` for a confirmed cart, follow the page's existing
  behaviour for non-payable carts. No explainer text.

## Tests (write first, see them fail)

`tests/integration/carts.int.test.ts`:
1. A single member covers their whole line with tokens, the cart reaches the minimum, and the owner
   accepts. The cart is `CONFIRMED`, there are no `PaymentSlip` rows, there is one `SPEND` entry,
   the balance is unchanged by the confirmation, stock is `reserved −qty` and `sold +qty`, and the
   members are notified "Group order confirmed".
2. LKR 0.01 left due: the flow behaves exactly as today (`AWAITING_SLIP`).
3. `approveSlip` regression: the existing slip tests still pass unchanged.
4. Accepting twice concurrently (`Promise.allSettled`) gives one confirmation, one `SPEND` per line,
   and stock moved once.

## Docs

- Record the decision under `DEC-013` in `docs/decisions.md`, as an approved owner rule dated
  2026-11-05.
- Add it as an edge case in `specs/001-factory-partnership/spec.md`.
- Add a dated `docs/CHANGES.md` line.
- Update `.claude/agents/payments-slips.md` and `.claude/agents/carts.md`, and update
  `docs/architecture.md` where it describes the slip flow.
- Commit this prompt file too.

## Constraints

- No new dependencies. Touch only this flow, its tests and the docs.
- Stage by path, never `git add -A`. One commit with your `Co-Authored-By` line.
- Run `npm run check`, `npm run test:int` and `npm run build`. Then run
  `GROUPBASKET_E2E=1 npx next build` followed by `CI=1 npm run e2e`. All must pass. Then run
  `git push origin main`.
- No force-push, no amending pushed commits, no deploying, no production data, no secrets and no
  branch resets.

## Report

Commit hash, push result, each command's summary, the name and signature of the shared
confirmation function, and any deviation and why.
