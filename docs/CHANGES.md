# Product-owner change log

Every change the product owner asks for is written here **and** reflected in `CLAUDE.md` and the
relevant `.claude/agents/*.md` files, in the same piece of work. Newest first.

## 2026-10-17

- **One cart at a time.** A buyer can own or be in only one active cart (rule 12). Starting,
  joining or adding to another is refused until the first is confirmed, expired, cancelled or
  left. Seed data follows the rule. _Agents: carts, grouptogether, qa-review._
- **"← Back" link** on the Start a cart page (previous page, else /carts). _Agent: frontend._
- **Open carts** no longer lists carts the signed-in user owns or has joined. _Agents: carts,
  frontend._
- **Email sending removed.** Notifications are in-app only; no Gmail/SMTP, no test email. Email
  addresses are still used to sign in and to find users to invite (rule 4). _Agents:
  notifications and all that mentioned email._
- **Product page stock by size.** Picking a size shows "N left in stock" for that size only;
  signed-out visitors can pick a size too. _Agent: frontend._

## 2026-10-16

- **Home banner** is now a "Total Sale" figure: the LKR value of carts an admin has confirmed
  (CONFIRMED, DISPATCHED, DELIVERED). It refreshes every 15 s from `/api/sales`. It replaced the
  hero text and buttons, the "Recent carts" block, and the earlier stock countdown. _Agent:
  frontend._
- **"Factory surplus" / "B-grade" labels** removed from listed items (home, shop, product page).
  Defects still show up front, now headed "Defects:" (rule 10). The shop subtitle was removed.
  _Agents: frontend, catalogue-admin._
- **Shop filters:** audience (Men, Women, Girl, Boy, Kid) → category that follows the audience →
  size that follows the category. Products carry `audience` and `kind`; lists live in
  `src/lib/taxonomy.ts`. The admin product form uses the same fields. _Agents: catalogue-admin,
  backend-data, frontend._
