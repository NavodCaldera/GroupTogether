---
name: groupbasket-access-review
description: Review GroupBasket role and ownership boundaries in admin, factory, brand, gift, messaging and private-file changes, including cross-account denial tests.
---

Read `AGENTS.md`, `.claude/agents/groupbasket.md`, the affected specialist and `docs/decisions.md` before changing visibility. Follow `DATA-001`, `COM-003` and brand/gift rules.

Trace access through pages, server actions, services, queries and file routes. Verify roles server-side and scope records by the authenticated principal; a hidden component or an identifier supplied by the browser is not authorization. Select only needed fields.

Check own-factory design metrics and own-brand products, paid recipients and settlements. Unpaid gifts expose only aggregate counts to brands. Keep internal admin notes, customer profiles, agent documents and other-brand data out of partner queries and payloads. Factories and agents never see buyer names or phones beyond what their own parcels need; factory Packing sees no money; agent pages also gate on `Agent.status`. Brands may see authorized paid gift delivery snapshots, not unrestricted customer profiles. Keep premium gift capacity separate from owned clothing stock.

Check financial timeline display and Sunday business dates in `Asia/Colombo`; preserve unambiguous stored instants rather than rewriting timestamps as local strings.

Run affected brand, gift, communication, photo and authorization integration tests. Exercise another account and an unauthenticated caller, including direct routes/actions rather than only navigation. Report evidence and untested boundaries. General static scanners cannot prove tenant isolation.
