# Business decisions and unresolved questions

Consolidated on **2026-10-24** from the existing brief and business-model review. The [main agent brief](../.claude/agents/groupbasket.md) owns established policy. This register separates open questions from approved requirements; it does not authorize new features or commercial commitments.

## Decision procedure

1. Check whether the owner has already resolved the question in the current session.
2. Otherwise, ask only when the decision is needed for the requested work; continue independent work.
3. Record the owner's actual decision, date and reason here. Update the corresponding stable rule ID, implementation status and affected specialist guidance, and add a changelog entry.
4. A decision can be approved before implementation. Do not mark a capability implemented until code and verification support that claim.

Examples and business-review recommendations are not approved settings. The repository does not prove a supplier agreement, partner endorsement or live deployment.

## Open decisions

### DEC-001 — Premium-brand distribution boundaries

**Status:** Distribution model resolved by the owner on **2026-10-25**; partner terms remain open. **Rules:** `BRAND-001`, `BRAND-002`, `BRAND-003`, `GIFT-003`.

The owner clarified that GroupBasket does not purchase or hold premium-brand stock. After the customer pays for a qualifying clothing purchase, GroupBasket authorizes a complimentary gift; the premium brand ships it directly to the customer. GroupBasket pays the brand at the agreed discounted partner price and settles outstanding gift bills every Sunday, using `Asia/Colombo` dates.

This replaces the earlier purchase-and-store model. Gifts are complimentary; no discounted resale exception is authorized. The rebuilt workspace excludes brands from factory receiving and shop-product linking; see [implementation status](implementation-status.md).

The owner's example uses clothing spend around LKR 20,000, factory cost LKR 10,000, gift retail value LKR 5,000 and a 30% partner discount, producing a LKR 3,500 brand bill. These are illustrative economics, not universal settings or confirmed partner agreements. Brand-specific prices, campaign duration/quantity and presentation terms remain unagreed. Brand-price protection is an objective, not a guarantee.

### DEC-002 — Family spending-unit identification

**Status:** Open implementation policy. **Rule:** `GIFT-001`.

Recorded intent permits a family cart or family subgroup in a mixed cart to combine spending. Unrelated members qualify individually; ownership alone earns no gift.

Define household identification, shared-address evidence, unrelated co-residents, address changes and membership in more than one family unit. The common cart delivery destination cannot establish family membership because every member's items already go to the owner. Do not silently introduce identity documents, verification services or a household schema as settled requirements.

### DEC-003 — Gift threshold and duplicate qualification

**Status:** Open. **Rule:** `GIFT-002`.

The original wording mixes "above/crosses" (with `> LKR 20,000` examples) and "reaches." Decide strict `>` versus inclusive `>=`, actual thresholds, the spend basis, tiers, whether individual/family awards can overlap, and whether qualification is per order or cumulative. LKR 20,000 is illustrative, not a configured default. Gift qualification remains separate from the cart checkout minimum.

### DEC-004 — Brand fulfilment, weekly billing and campaign economics

**Status:** Direct brand delivery and Sunday settlement approved on **2026-10-25**; operating details open. **Rules:** `GIFT-002`, `GIFT-003`, `BRAND-003`.

Owner clarification on **2026-10-25**: a gift in an unpaid basket reserves quantity and reduces availability. Verified clothing payment is required before the brand may dispatch it. The customer pays the gift's separate delivery. The brand ships directly to the eligible customer and GroupBasket settles approved gift bills each Sunday. Owned gift inventory and staff gift packing are no longer requirements.

Current implementation uses explicit admin eligibility/recipient assignment, with one active gift per recipient/basket as a duplicate guard. Brands see only reserved totals before payment, then the gift recipient's delivery details. Removal, leaving, cancellation and expiry release reservations; clothing quantity reductions release that recipient's gift for manual eligibility reassessment, and merges preserve it. This does not resolve automated threshold, overlapping household awards or customer gift selection.

Gift delivery cost responsibility is resolved: the customer pays. The fee amount, quote acceptance and collection method remain open. Also decide dispatch deadlines, stock-outs/substitutions, failed delivery, damaged gifts, replacements and post-payment cancellations. Billing is manually approved before an admin records a completed external transfer; an automatic billing trigger, Sunday cutoff and dispute/credit handling remain open. No bank or courier automation or specific refund terms are approved by this entry.

Gift cost reduces the contribution from clothing. Campaign budgets, profit floors, quantity caps and other commercial controls require owner decisions. These were review recommendations, not existing rules. No default gift budget has been approved.

### DEC-005 — Condition disclosure and after-sales exceptions

**Status:** Open exception policy. **Rules:** `CAT-002`, `PAY-003`.

Current recorded scope hides stock-type/defect fields and has no refund workflow. Preserve those instructions until changed. Resolve product-condition disclosure, quality/fit complaints, incorrect/damaged items, failed delivery after payment, and duplicate/late/unmatched bank transfers.

Reservations prevent overselling; they do not answer these cases. This entry neither introduces a refund entitlement nor approves a new blanket refusal policy. Changes require a concrete business decision and corresponding implementation.

### DEC-006 — Measurement-based recommendations

**Status:** Planned capability; details open. **Rule:** `FIT-001`.

Decide optional/required measurements, units, garment measurements/size charts, behavior when data is absent, and collection/visibility/editing/deletion of profile measurements. Approximate dimensions alone do not justify exact-fit promises. Personalization is not implemented.

### DEC-007 — Geographic seller insights

**Status:** Open. **Rules:** `SUP-003`, `DATA-001`.

Earlier design-dashboard notes leave district-level insights undecided. Confirm whether suppliers should receive geographic aggregates and how to preserve buyer privacy before introducing them. Permission for buyer counts does not authorize names, addresses or individual carts.

### DEC-008 — Deployment and provider dependencies

**Status:** Unresolved launch dependencies, not new business policy.

- Choose hosting and durable upload storage; local-disk uploads need a persistent filesystem or object-storage implementation.
- Obtain actual PickMe business API documentation and credentials before enabling automated booking/webhook mapping. Manual booking remains the supported default.
- Configure business bank details and scheduled deadline sweeps for the intended environment.

Use [architecture](architecture.md) and [README](../README.md) for technical details. This register does not authorize deployment or external-account actions.

### DEC-009 - Pre-purchase group samples

**Status:** Sample delivery and fee responsibility approved by the owner on **2026-10-27**. **Rule:** `SAMPLE-001`.

Groups may request a sample of a particular apparel design/pattern before buying as a group. GroupBasket delivers the sample to the group, charges no sample sending fee, and the group pays transport. This does not mean factory test pieces or premium gifts. The implementation coordinates requests through the group owner and records explicit acceptance of the transport quote before dispatch; bank/courier operations remain external. Sample ownership, returns, loss/damage terms and any transport collection mechanism remain open; do not invent deposits, automatic charges or return obligations.

### DEC-010 - Factory-direct fulfilment

**Status:** Approved by the owner on **2026-11-03**. **Rules:** `SUP-001`, `SUP-002`, `FUL-001`–`FUL-003`, `LOT-001`.

GroupBasket no longer buys clothes from factories. Each factory packs its paid orders and marks them packed; the admin books PickMe from the factory and tracks the drop until delivered. A cart holds products from one factory only. There is no lot price drop. Packing staff are parked, not deleted, behind `FULFILMENT_MODE` (default `FACTORY`). Open: how our own listings (products with no factory) are fulfilled, factory payment terms, and who answers for a parcel lost between factory and owner.

## Legacy rule references

Former `CLAUDE.md` rules are mapped below so historical comments and specialist notes remain traceable. New work should reference stable IDs in the [main brief](../.claude/agents/groupbasket.md#6-business-rules).

The old `groupbasket.md` had inconsistent/repeated numbers and was later renumbered; identify those references by topic, not number alone. Historical descriptions are not alternative active policies.

| Former CLAUDE.md topic / number           | Current rule or reference                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 1 — Minimum order                         | `CART-001`                                                                   |
| 2 — Stock reservation                     | `INV-001`                                                                    |
| 3 — Cart expiry                           | `CART-002`                                                                   |
| 4 — Minimum reached notices               | `CART-001`, `COM-001`                                                        |
| 5 — Owner payment                         | `PAY-001`, `PAY-002`                                                         |
| 6 — Slip review                           | `PAY-002`                                                                    |
| 7 — No refunds                            | `PAY-003`, `DEC-005`                                                         |
| 8 — Delivery                              | `FUL-001`, `FUL-003`                                                         |
| 9 — Visibility/sharing                    | `CART-004`                                                                   |
| 10 — Stock type/defects                   | `CAT-002`, `DEC-005`                                                         |
| 11 — Roles, sellers, design tests, brands | Participants table; `SUP-001`–`SUP-003`, `DATA-001`, `BRAND-001`/`BRAND-002` |
| 12 — One active cart                      | `CART-003`                                                                   |
| 13 — Location/pins                        | `LOC-001`                                                                    |
| 14 — Merge                                | `CART-005`                                                                   |
| Duplicated 14 — Owner chat                | `COM-002`                                                                    |
| 15 — Nearest carts                        | `CART-004`                                                                   |
| 16 — Cart names                           | `CART-004`                                                                   |
| 17 — Receiving/packing                    | `SUP-002`, `FUL-002`                                                         |
| 18 — Availability replaces statuses       | `CAT-001`                                                                    |
| 19 — Admin task ownership                 | `UX-002`                                                                     |
| 20 — Lots and turnover                    | `LOT-001`, `LOT-002`                                                         |
| 21 — Premium promotional gifts            | `BRAND-001`, `GIFT-003`, `DEC-001`                                           |
| 22 — Body measurements                    | `FIT-001`, `DEC-006`                                                         |
| 23 — Family/individual gifts              | `GIFT-001`, `GIFT-002`, `DEC-002`–`DEC-004`                                  |
| 24 — Brand partner dashboard              | `BRAND-002`, `DEC-001`                                                       |
