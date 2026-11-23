# Contracts: server actions and services

| Action / service | Input | Result | Refusals (shown to the user) |
|---|---|---|---|
| `joinGroupAction` → `holdSpot(userId, groupId)` | groupId | Redirects to the gateway checkout for the `PACK_JOIN` attempt | not open, full, already a member, no pinned address, more than 1 km away |
| `startGroupAction` → `startGroup(userId, versionId)` | versionId | A PENDING group with the owner's held spot, then the gateway | no pinned address, pack unavailable |
| notice `PACK_JOIN` SUCCEEDED → `confirmSpot` | attemptId | member PAID; group OPEN if owner, FULL plus a PackDelivery if last | late after the hold expired: tokens refunded |
| notice FAILED or CANCELLED → `releaseSpot` | attemptId | member deleted, `joined − 1`; a PENDING group is deleted | none |
| sweep `packGroups(now)` | none | extends, closes and refunds, releases expired holds | none |
| `markDeliveryAction` (seller) | deliveryId, DISPATCHED | status updated | not the seller's |
| `receiveDeliveryAction` (owner) | deliveryId | RECEIVED, payout due | not the owner, or not dispatched |
| `nearbyGroups(versionId, buyer)` | buyer location | `{id, distanceKm, city, joined, size, spotsLeft, closesAt}[]` | none (never includes member data) |
| `groupContacts(userId, groupId)` | none | owner and member first names and phones | not a member, or not FULL |
