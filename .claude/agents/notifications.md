---
name: notifications
description: "In-app notifications in GroupTogether. Use for src/server/notify/, the notifications page, the header bell, and any new message to users."
---

## Project at a glance

GroupTogether is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

- Shoppers fill shared carts. Each cart needs **LKR 50,000** (snapshotted per cart) and expires **24h** after creation.
- **Stock is locked as soon as an item is added.** Reaching the minimum **notifies every member in the app**.
- **Log every product-owner change** in `docs/CHANGES.md` and update the matching agent files in the same piece of work.
- Only the **owner pays**, for the whole cart. After "Accept & pay" they have **2h to upload one bank slip**, or the cart is cancelled and its stock released.
- An admin approves the slip (CONFIRMED) or rejects it (a fresh 2h window). **There are no refunds.**
- Delivery is **one PickMe drop to the owner, who pays the driver**. The platform never touches the fee.
- Carts are PUBLIC (on the open-carts panel) or PRIVATE (link or invite only).
- Priorities: **speed and minimum cost**.
- Stack: Next.js 16, React 19, Prisma 7 + Postgres, Tailwind 4, zod, decimal.js.
- Statuses: OPEN → READY → AWAITING_SLIP → SLIP_REVIEW → CONFIRMED → DISPATCHED → DELIVERED, plus EXPIRED and CANCELLED.

The full brief is in `.claude/agents/grouptogether.md` and `CLAUDE.md`. Read them when your task touches another area.

## Your area: notifications

**Files:**

- `src/server/notify/index.ts` (`notify`, `unreadCount`, `appUrl`)
- `src/app/notifications/page.tsx`
- the bell in `src/components/site-header.tsx`

**How it works:**

- `notify(userIds, { title, body, href })` writes in-app `Notification` rows. **There is no email sending** (removed 2026-10-17 by the product owner). Email addresses are only for sign-in and finding users to invite.
- **Call it after the transaction commits**, never inside one.

**Who is notified, and how:**

| Event                                        | Who                          |
| -------------------------------------------- | ---------------------------- |
| Cart reaches the minimum (OPEN → READY)      | every member                 |
| Owner accepts                                | the other members            |
| Slip uploaded                                | admins                       |
| Slip approved, order confirmed               | every member                 |
| Slip rejected (re-upload within 2h)          | owner                        |
| Slip window missed, cart cancelled           | every member                 |
| Cart expired                                 | every member                 |
| Cart cancelled by the owner or an admin      | members except the canceller |
| Invited to a cart                            | invitee                      |
| Asks to merge into a cart                    | that cart's owner            |
| Merge accepted                               | the requester                |
| Merge declined                               | the requester                |
| Delivery booked (pay the driver about LKR x) | owner                        |
| Seller submits a product for review          | admins                       |
| Admin publishes a seller's product           | that seller                  |
| Admin returns a seller's product with a note | that seller                  |

Keep the messages short and say what to do next. Every notice should have an `href` to the cart or page it is about. If cost matters, an SMS or WhatsApp API is a possible later step; it is not built.
Chat messages notify the recipient once per conversation while a notice for it is unread (href `/c/<code>?chat=<participantId>`).

**Messages (cart chat):** `src/server/carts/chat.ts`. A conversation is (`cartId`, `participantId`): the owner talks to each buyer separately. `sendMessage` notifies the other side once per unread conversation with `href` = `conversationHref(cartId, participantId)` (`/messages?c=…&with=…`). `listMessages` marks the other side's messages read (`CartMessage.readAt`) and clears that notice. It returns each message with `seen` (`readAt` set), shown to the sender as ticks: one grey sent, two green seen. The `/messages` list shows only initial, name, time and unread count. `inbox(userId)` lists all conversations with last message and unread count; `unreadMessageCount` feeds the header chat icon.

**Join requests:** after Accept / Decline on `/notifications`, the result is a `Toast` pop-up (`?done=accepted|declined`), not a banner. The "wants to join your cart" notice has an empty body (the page shows only its title, no time, then the buttons) and href `/c/<code>?request=<id>`; `/notifications` shows Accept / Decline on it while the request is PENDING (older notices are matched by cart code and requester name). The actions take `back=/notifications` to return there and mark that notice read.
Opening a notice goes through `src/app/notifications/[id]/route.ts`: marks it read (own notices only), then redirects to its same-site `href`. Link to it with a plain `<a>`, never `next/link` (prefetch would mark it read).
- **Owner marked the order delivered** (2026-10-18, `markReceived`): the other members get "Your group order was delivered" (collect your items from the owner).
- **Packing staff** (2026-10-18, rule 17), via `notifyRole("PACKER", …)` in `notify/index.ts` (unlocked users of the role): "New order to pack" when a slip is approved (`approveSlip`; "One of you checks and gathers it, someone else rechecks and packs it."), "PickMe booked" when the drop is booked (`bookDelivery`), both linking to `/packing/<code>`. When a packer hands the parcel to the driver (`handOver`) the **owner** gets "Your order is with the PickMe driver".
