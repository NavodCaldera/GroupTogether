# Data Model: Family Packs

This is the delta on the MVP schema. Unchanged fields are left out.

| Entity | Fields | Rules |
|---|---|---|
| **Company** | + `sellerId` → User (SELLER) | Demo companies have `demo = true` |
| **PackVersion** | + `commissionPct Decimal(5,2)` | Never updated once `publishedAt` is set. `groupSize` is CHECKed to 5–15 |
| **PackGroup** | − `agentId`; + `ownerId`, `lat`, `lng`, `address`, `city`, `extensions Int @default(0)`, `closesAt DateTime` (required) | `joined` = HELD + PAID members, and is never more than `groupSize` |
| **PackMember** | + `status HELD\|PAID`, `heldUntil DateTime?` | `@@unique([groupId, userId])` |
| **PaymentAttempt** | + `packMemberId String? @unique` | purpose `PACK_JOIN` |
| **PackDelivery** (new) | `id`, `groupId @unique`, `companyId`, `families Int`, `amountDue Decimal(14,2)`, `status ORDERED\|DISPATCHED\|RECEIVED`, `receivedAt?`, `payoutId?` | Created when the group becomes FULL |
| **User** | − `pickupAgentId` | |
| **Enums** | `PackGroupStatus` + `PENDING`; `PaymentPurpose` + `PACK_JOIN`; `TokenKind` + `PACK_REFUND`; new `PackMemberStatus`, `PackDeliveryStatus` | |

## Group state
- PENDING → OPEN when the owner's attempt SUCCEEDS.
- PENDING → deleted when the owner's attempt fails or expires.
- OPEN → FULL when `joined == groupSize` and every member is PAID.
- OPEN → OPEN on extension, at most 2 times.
- OPEN → CLOSED after that, with refunds.

## Money
- `commission = roundMoney(price × pct / 100)`.
- `amountDue = (price − commission) × families`.
