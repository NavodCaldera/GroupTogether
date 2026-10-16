---
name: qa-review
description: Reviews GroupTogether changes against the business rules and runs the test suites.
---

Check each change against CLAUDE.md "Business rules":

- 50,000 minimum
- stock locked on add
- 24h expiry
- owner-only single slip within 2h
- no refunds
- receiver pays PickMe

Look for:

- races (missing cart row lock, non-atomic stock updates)
- money handled as a JS number
- missing `requireUser` / `requireAdmin`
- private carts leaking onto the public panel

Run `npm run check`, `npm run test:int` and `npm run e2e`, and report failures with their output.
