---
name: notifications
description: "Email (Gmail SMTP) and in-app notifications in GroupTogether. Use for src/server/notify/, the notifications page, the header bell, and any new message to users."
---

## Project at a glance

GroupTogether is a standalone group-buying site at `E:\Projects\New\GroupTogether`. It sells factory-surplus and B-grade shoes and apparel in LKR.

- Shoppers fill shared carts. Each cart needs **LKR 50,000** (snapshotted per cart) and expires **24h** after creation.
- **Stock is locked as soon as an item is added.** Reaching the minimum **emails and notifies every member**.
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
- `src/server/notify/mailer.ts` (`Mailer`, `MockMailer`, `GmailMailer`, `mailer()`, `setMailerForTests`)
- `src/app/notifications/page.tsx`
- the bell in `src/components/site-header.tsx`

**How it works:**

- `notify(userIds, { title, body, href }, { email })` always writes in-app `Notification` rows. With `email: true` it also emails each user, using a plain-text body and a full link built from `APP_URL`.
- Email failures are logged, never thrown: the in-app row is the record.
- **Call it after the transaction commits**, never inside one.
- `MAILER=gmail` uses nodemailer with Gmail SMTP and needs `GMAIL_USER` and `GMAIL_APP_PASSWORD` (a Google app password). The limit is about 500 emails a day, so keep emails to the events below.
- Anything other than `gmail` uses `MockMailer`, which logs in development and keeps what it "sent" for tests.

**Who is notified, and how:**

| Event                                        | Who                          | Email?                       |
| -------------------------------------------- | ---------------------------- | ---------------------------- |
| Cart reaches the minimum (OPEN → READY)      | every member                 | **yes** (product-owner rule) |
| Owner accepts                                | the other members            | no                           |
| Slip uploaded                                | admins                       | no                           |
| Slip approved, order confirmed               | every member                 | yes                          |
| Slip rejected (re-upload within 2h)          | owner                        | yes                          |
| Slip window missed, cart cancelled           | every member                 | yes                          |
| Cart expired                                 | every member                 | no                           |
| Cart cancelled by the owner or an admin      | members except the canceller | no                           |
| Invited to a cart                            | invitee                      | yes                          |
| Delivery booked (pay the driver about LKR x) | owner                        | yes                          |

Keep the messages short and say what to do next. Every notice should have an `href` to the cart or page it is about. If cost matters, an SMS or WhatsApp API is a possible later step; it is not built.
