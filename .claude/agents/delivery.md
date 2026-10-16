---
name: delivery
description: PickMe delivery for GroupTogether. Use for src/server/delivery/ and the PickMe webhook.
---

- Each confirmed cart gets one PickMe drop to the cart owner's drop-off address, which is set when the owner accepts.
- **The owner (the receiver) pays the driver directly.** The platform never charges, collects or refunds a delivery fee. `Delivery.paidBy` is always OWNER, and `quotedFee` is only shown to the owner.
- Members settle their share of the fee with the owner outside the platform.
- PickMe has no public API. The `PickMeProvider` request and webhook shapes are ASSUMED until we have PickMe business docs. Until then the manual provider is the default: the admin books the trip in the PickMe app and enters the details.
- Booking moves the cart to DISPATCHED. DELIVERED (from the admin or the webhook) moves it to DELIVERED.
- Webhooks are verified with HMAC-SHA256 of the raw body, sent in `x-signature`.
