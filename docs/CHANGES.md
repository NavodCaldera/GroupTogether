# Product-owner change log

Every change the product owner asks for is written here **and** reflected in `CLAUDE.md` and the
relevant `.claude/agents/*.md` files, in the same piece of work. Newest first.

## 2026-10-17

- **Clicking a notification marks it read** and opens its page (`GET /notifications/<id>` marks it read and redirects; links are plain `<a>` so prefetch never marks anything). _Agents: notifications, frontend._
- **Messages:** removed the "<cart name> →" link under the person's name in an open conversation. _Agent: frontend._
- **Seen ticks on chat messages, WhatsApp style.** Under your own messages: one grey tick = sent, two **green** ticks = seen (green instead of WhatsApp's blue). Seen means the other side has opened the conversation (`CartMessage.readAt`); `listMessages` returns `seen`. Updates within the 8 s poll. _Agents: notifications, frontend._
- **Messages list is shorter.** Each conversation in `/messages` shows only the person's initial, name, time and unread count; the "About your cart" / cart-name line and the last-message preview ("You: hello") were removed. `inbox()` still returns them. _Agents: frontend, notifications._
- **Shop opens with the lowest prices.** With no search or filter, `/shop` lists live products cheapest first (`listProducts(…, "cheapest")`); once a search or filter is applied it stays newest first. _Agent: frontend._
- **Shop filters stack on phones.** Search, Audience, Category, Size and Filter each take a full-width row on small screens (the two-column grid cut off "Choose audience first" / "Choose category first"); from 640px up they stay in one wrapping row. _Agent: frontend._
- **"How we solve the problem" on the home page.** Its own section between "How it works" and "Affordable prices" (the product grid now sits under the diagram): two boxes joined by an arrow (→ from tablet width up, ↓ stacked below that, with tighter padding and smaller icons on phones): "Bulk buying from factory surplus" → "Consumer group buying", then one green, bold result sentence led by a small green dot that stays beside the text ("On average X% below retail. No middlemen, no small-order costs."). If at least 3 live products list a retail price above ours, the line shows the real saving ("On average X% below retail"; total saving ÷ total retail, from `retailSaving` in `catalogue.ts`); otherwise "Lower prices for you". Markup only, no client JS. _Agents: frontend, catalogue-admin._
- **Home product section heading** changed from "Lowest prices" to "Affordable prices". _Agent: frontend._
- **Home "How it works" trimmed** to the four numbered step titles (descriptions removed). _Agent: frontend._
- **Answer join requests from Notifications.** A "<name> wants to join your cart" notice now shows what they bring and Accept / Decline buttons right there (afterwards: "You accepted" / "You declined"). The notice carries the request id. _Agents: carts, notifications, frontend._
- **Profile page and icon.** A profile icon at the right of the header opens `/account`: name, mobile, address, city and map pin, plus Sign out (moved off the header). "Accept & pay" no longer asks for an address: it shows "Deliver to <profile address> · <mobile>" with a Change link and uses the profile. `/account/location` redirects to `/account`. _Agents: frontend, carts, delivery._
- **Invite form removed** from the cart page ("Invite by email or phone"). People join through the share link or WhatsApp (rule 9). The cart's "Cancel cart" link is now a red "Cancel" button. `InviteForm`/`inviteAction` remain in code but unused. _Agents: carts, frontend, grouptogether._
- **Cart page: fewer words.** The progress bar stays in every state ("X to go" or "Minimum reached"). Short status lines ("The owner is paying.", "Checking the payment.", "Paid. Packing for delivery."), buttons "Pay & upload slip", "Accept & pay", "Leave cart", "Cancel cart"; the long READY explanation, "1 person" line and the quantity hint were removed. _Agent: frontend._
- **Amber (`warn`) is only for time left.** Countdowns and deadlines stay amber; everything else moved off it: "Awaiting payment"/"Payment in review", product "In review", "Picked up" and seller badges are now the soft green `info` badge; B-grade and pending-slip badges are neutral; urgent admin counts and the review card use the accent; low stock and missing settings use red; "Request sent" is grey. The `warn` badge tone was removed. _Agent: frontend._
- **Simpler buyer dashboard.** One card for the buyer's one cart: status, a 4-step line (Open → Ready → Paid → Delivered), one sentence on what happens next, a countdown (amber under 2h) and one main button that follows the state (Add items + WhatsApp, Accept & pay, Upload bank slip, Track delivery). No cart: "Find an open cart" / "Start my own cart" plus any invites. Below it, up to 3 past orders (hidden when none). Removed the stats row, the separate To-do list, the header Start/Join buttons and "Latest notices" (the bell covers them). Rule: `nextStep` / `journeyStep` in `cart-rules.ts`. _Agents: frontend, carts._
- **Current page is marked in the header:** a green underline under the link for the page you are on (Shop also covers product pages, Carts also covers cart pages; the chat and bell icons too). On phones the current bottom tab turns green. _Agent: frontend._
- **Messages inbox so owners can reply properly.** New `/messages` page lists every conversation
  (as an owner: one per person who wrote; as a buyer: one per cart owner), newest first, with the
  last message and an unread count; tapping one opens it to read and reply. A chat icon with the
  unread count sits next to the bell. Message notices now open the conversation, and opening it
  marks it (and its notice) read. The owner's cart page shows every conversation with unread
  counts. _Agents: notifications, frontend, backend-data, qa-review._
- **Share is an icon next to the cart name.** Tapping it opens a small menu: Copy link or Share
  on WhatsApp. The separate share box is gone; the invite box for members sits under "In this
  cart". _Agent: frontend._
- **Cart page redesigned as one column:** name with "N people · X km away"; a progress card
  ("LKR 49,800 of LKR 50,000", bar, "to go" + time left) that always ends in one next step with a
  button (a blocked buyer gets "Go to your cart"); "In this cart" (a total per person); the
  message box directly under it; share buttons; the delivery map; leave/cancel as quiet links
  last. _Agent: frontend._
- **Other people's items are hidden on the cart page:** each member (and the owner) shows only a
  name and a total. Only your own row opens, to change your items. _Agent: frontend._
- **Cart page simplified** (`/c/[code]`): name (status badge only when not Open), one bar with
  "LKR N to go" and the time left, then a single call to action. Merge shows only one message
  (the reason it can't happen, or the question and one "Ask to join" button). Members became
  collapsible rows ("You · 3 items · LKR 13,800", open for your own row or a one-member cart).
  Share is one row (Copy link, WhatsApp, code); the message box is a collapsed "Message <owner>".
  _Agent: frontend._
- **Open carts card simplified:** name, progress bar, "LKR N to go" (green "Minimum reached"), and
  one small grey line "94 km · 11h 27m left" (amber only in the last 2 hours). The Open badge,
  city, member count, "X of Y" line and "Join →" text are gone; the whole card is the link.
  _Agent: frontend._
- **Carts are named after their owner** ("Navod Caldera's cart", rule 15). The "Cart name" box is
  gone from Start a cart and from the product page's new-cart option; the seed follows. A migration
  renamed every existing cart to its owner's name. _Agents: carts, frontend, backend-data._
- **Header bell** is now a white outline icon (inline SVG in the text colour, so it stays dark in light mode) instead of the yellow 🔔 emoji. _Agent: frontend._
- **Pay page:** removed the "Back to the cart" link at the bottom; the "← Back" link at the top replaces it. _Agent: frontend._
- **"← Back" links on every inner page:** product, cart, pay, account location, and the admin and seller detail/new pages (product, cart, user, new seller). Goes to the previous page, else a sensible parent (shop, open carts, the cart, the admin or seller list). Top-level pages reached from the header have none. _Agent: frontend._
- **Shop search suggestions.** Typing 2+ letters in the shop search shows a dropdown of matching live products (title or brand, with price); choosing one opens it, Enter still searches. `GET /api/suggest`, `suggestProducts`. _Agents: frontend, catalogue-admin._
- **Shop filter chain enforced:** the category box stays disabled until an audience is picked, and
  the size box until a category is picked (also in the admin product form). _Agents: frontend,
  catalogue-admin._
- **Home page product list** shows the 8 lowest-priced live items, cheapest first (was "New in", newest first). `listProducts(..., "cheapest")`. _Agent: frontend._
- **Delivery point map and owner chat on the cart page** (rule 14). Map of the owner's pin: exact for members/admins, approximate area for others. Private chat between a cart's owner and any signed-in user, polled every 8 s; in-app notice per conversation. _Agents: carts, frontend, notifications, backend-data, grouptogether, qa-review._
- **Open carts sorted nearest-first, and searchable by name** (rule 14). Each card shows how far
  away it is. _Agents: carts, frontend, qa-review._
- **City suggestions + map jump.** Typing a city in the location picker suggests Sri Lankan places (Photon, free OpenStreetMap search, no key) and moves the map to the best match; picking one zooms in. The pin is still placed by the buyer. _Agent: frontend._
- **Merge into a friend's cart.** A buyer in a full cart can ask to join another; the owner there
  accepts or declines. On accept the items move over, the buyer's old cart is deleted, and they can
  keep adding (rule 13). _Agents: carts, backend-data, frontend, notifications, qa-review._
- **Address + exact map pin is mandatory** when signing up, joining a cart or starting one (rule
  13). The pin is chosen on a map (Leaflet + OpenStreetMap, free, loaded only where used): tap,
  drag, or use the device location; it must be inside Sri Lanka. Saved on the profile and on each
  membership; the owner's pin goes to the delivery and the admin cart page links to it. Existing
  accounts without a pin are asked at `/account/location`. _Agents: carts, frontend, backend-data,
  delivery, grouptogether, qa-review._
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
