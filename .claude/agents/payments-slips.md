---
name: payments-slips
description: Bank-slip upload and admin review in GroupTogether. Use for src/server/carts/slips.ts, the /c/[code]/pay page and /admin/slips.
---

Payment is a bank transfer only. There is no card gateway.

- The cart owner uploads **one** slip (JPEG, PNG, WebP or PDF, up to 5 MB) for the whole cart total, within 2h of accepting.
- Uploading moves the cart to SLIP_REVIEW and stops the timer.
- An admin approves the slip (→ CONFIRMED, reserved stock becomes sold) or rejects it with a reason (→ AWAITING_SLIP with a fresh 2h window).
- The owner can't cancel while a slip is in review. An admin can.
- The system has no refunds.
- Slip files are private: only the uploader and admins can open `/api/slips/[id]`.
- Bank account details come from Settings and are shown on the pay page.
