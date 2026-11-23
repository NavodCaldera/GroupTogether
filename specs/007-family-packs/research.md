# Research: Family Packs

No unknowns were marked NEEDS CLARIFICATION. Each decision below is taken from the existing code.

**1. How to take payment**
- **Decision:** reuse `PaymentAttempt` with the new purpose `PACK_JOIN` and `packMemberId`, and the verified notice in `src/server/payments/notice.ts`.
- **Rationale:** signing, late and duplicate notices are already handled.
- **Alternatives:** a separate pack payment table (duplicates the gateway logic).

**2. How to refund**
- **Decision:** `post()` in `src/server/tokens.ts` with kind `PACK_REFUND` and the key `pack-refund:<memberId>`.
- **Rationale:** the ledger is append-only and idempotent.
- **Alternatives:** gateway refunds (not supported).

**3. How to find nearby groups**
- **Decision:** a bounding box in SQL of ±0.01° (about 1.1 km), then the exact check with `distanceKm` from `src/lib/distance.ts`.
- **Rationale:** no PostGIS is needed, and it is fast enough at this scale.
- **Alternatives:** PostGIS (a new extension).

**4. How to fulfil a full group**
- **Decision:** a new `PackDelivery` model.
- **Rationale:** `Order` and `Basket` depend on variants and agents (AD-7).
- **Alternatives:** reuse `Order` (breaks its invariants).

**5. How to pay companies**
- **Decision:** a pack amount due, read by the existing weekly payout once the delivery is RECEIVED.
- **Rationale:** a single payout run.
- **Alternatives:** a separate pack payout (two payout runs).
