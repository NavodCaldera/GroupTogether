# Product-owner change log

Every change the product owner asks for is written here **and** reflected in `CLAUDE.md` and the
relevant `.claude/agents/*.md` files, in the same piece of work. Newest first.

## 2026-10-18

- **Admin cart page: no "<name>'s cart · Owner … · phone · email" line under the title.** The header shows only "Cart <code>" and the status badge. _Agents: catalogue-admin, frontend._
- **No "Paid, not booked yet · Book delivery →" line on admin carts.** A confirmed cart no longer shows that next-step line and button (cart list and cart page); the Book delivery form on the cart page is unchanged. `adminNextStep` returns `null` for CONFIRMED. _Agents: delivery, catalogue-admin._
- **No "Driver phone" on the delivery booking form.** The admin enters the PickMe ref, fee, tracking link and driver name only; the phone is no longer shown on the cart page or deliveries list. `Delivery.driverPhone` stays in the schema, unused (like `defectNotes`). _Agents: delivery, catalogue-admin._
- **Admin Users page redesigned for phone, tablet and desktop.** Phones: one card per user (initials, name, email, role, tap-to-call mobile, city, what they do here and when they signed up); tap anywhere on the card to open the user. Small tablets show two cards per row. From tablet width a table: user (name + email), role (sellers with their company), mobile, activity and signed-up date, with the city column added on desktop. Activity is a buyer's carts (started / joined, plus the cart they are in right now with its status, linking to it), a seller's product count, or "Back office" for admins. The role filters show counts that follow the search (a dropdown on phones), there is a "N users" line, and an empty result offers "Show everyone". _Agents: catalogue-admin, frontend._
- **Admin Carts page redesigned.** "Needs you" tiles on top (slips to review, carts to book, out for delivery). The 10 status chips became stage tabs: **Active** (the default: everything not yet delivered or closed), Filling, Paying, Delivering, Done, Closed and All, with counts (a dropdown on phones). Each cart shows its **next step**: who it's waiting on and the deadline ("Owner to pay · 1h 20m left"), or a button when it's the admin's move (Review slip, Book delivery, Mark delivered). Open carts show a thin bar toward their minimum. Live tabs list the admin's turn first, then the soonest deadline ("Due first"; "Latest" sorts by last activity). A line sums the view (carts, total, how many hold stock). Phones get cards instead of the wide table. The cart page gains a stage bar with the next step, a dated timeline instead of run-on lines, and clear delivery buttons ("Mark picked up", "Mark delivered", "Delivery failed"). _Agents: catalogue-admin, grouptogether._
- **Admin overview redesigned for phone and desktop.** The seven equal tiles (mostly zeros) are replaced by a **To do** card that lists only what needs someone (slips to review, carts to book with PickMe, seller products to review, low stock) and the running deadlines (slip windows, carts expiring within 6h), or "All clear", plus one line of pipeline counts. **Confirmed sales** shows today / 7 days / 30 days and the average order, with a new 14-day column chart (hover or focus a day for its total; "Show as table" for the numbers). Recent orders, low stock and best sellers are compact lists. Phones: one column, most urgent first, with the action items above the fold. Desktop: work and sales on the left, lists on the right. Export orders is a small link by the title, and the admin tab row no longer shows a grey scrollbar. `dailySales` in `admin-queries.ts`, `sales-chart.tsx`, `--chart` colour token. _Agents: catalogue-admin, frontend, grouptogether._
- **Bank slips page redesigned as a review queue.** Desktop: pending slips on the left (amount, cart code, owner, how long it has waited; oldest first) and the open slip on the right. Phones: the queue, then one slip full screen with Reject / Approve docked at the bottom. The slip image shows in the page (a PDF opens in a new tab); beside it, what to check on the bank account (amount, cart code as the reference with a copy button, our account from Settings), the owner with a tap-to-call phone, and any earlier rejected slips with their reasons. Approving asks once more ("Yes, approve"), since it can't be undone; rejecting suggests common reasons. After either, a pop-up and "Next slip →" (plus "Book the PickMe delivery" after approving) instead of jumping to the cart page. An empty queue lists "Expected soon": carts whose owners still have to upload. The Reviewed tab can be filtered by result and searched by cart code or owner, and shows cards on phones instead of a wide table. _Agents: payments-slips, catalogue-admin._
- **Admin → Carts status filter is a dropdown on phones.** The 10 status chips (which wrapped into 5 rows) become one native dropdown with counts ("All statuses (24)", "Open (3)"…); picking one applies it at once (Apply button without JavaScript). From 640px up the chips stay. Reusable `FilterSelect` in `src/app/admin/filter-select.tsx`. _Agents: catalogue-admin, frontend._
- **Slip approved / delivery booked are pop-ups.** On the admin cart page, "Slip approved. The order is confirmed; book the PickMe delivery." and "Delivery booked. The owner has been told to pay the driver." now show as a toast at the bottom (5 s, ✕ to close) instead of a banner under the title. _Agents: payments-slips, delivery, frontend._
- **Admin tab bar sits closer to the word.** The green bar is now just under the open tab's label (about 3–5 px) instead of on the row's bottom edge; this also removes the stray grey scrollbar that showed under the tabs on Windows. _Agent: frontend._
- **Admin tabs show the open page with a green bar.** The admin tab row (Overview, Bank slips, Carts, Deliveries, Products, Users, Settings) underlines the current section in green and makes it bold, like the main header; sub-pages count too (e.g. Add factory seller → Users), Overview only on `/admin` itself. `NavLink` gained an `exact` option. _Agents: frontend, catalogue-admin._
- **No phone tab bar for admins.** With only "Admin" left in it, the bottom tab bar is gone for admins; they use the logo (→ `/admin`) and the admin section links at the top of the page. The footer's extra bottom space for the bar is dropped for them too. Buyers, sellers and visitors keep the tab bar. _Agent: frontend._
- **No Carts or My carts for admins.** Both tabs are gone from the admin's header and phone tab bar, which now shows only Admin. Opening `/carts` as an admin goes to Admin → Carts, and `/my-carts` goes to `/admin`. Buyers keep both. _Agent: frontend._
- **No Shop for admins.** The Shop tab is gone from the admin's header and phone tab bar (they see Carts, My carts, Admin), and opening `/shop` as an admin goes to Admin → Products. Buyers and sellers keep Shop. _Agent: frontend._
- **No home page for admins.** Opening `/` as an admin redirects to `/admin`; the Home tab is hidden for admins (phone tab bar and desktop header) and the logo links to `/admin`. Buyers, sellers and visitors still get the home page. _Agent: frontend._
- **"Slip uploaded. We'll check it." is a pop-up.** After the owner uploads the bank slip (`/c/<code>?paid=1`) it shows as the bottom `Toast` that hides itself, instead of a green box at the top of the cart page. _Agent: frontend._
- **Cart page: no "Minimum reached" pill by the title.** Once a cart reaches the minimum, the green pill beside the cart name is hidden (the progress bar already says "Minimum reached"). Later states (Payment in review, On the way…) still show their pill. _Agent: frontend._
- **Cart page: one box per member.** "In this cart" shows each person (the owner, other members and "You") in their own rounded box with a small gap, instead of rows inside one shared box. Your own box still opens to change quantities. _Agent: frontend._
- **Cart page: no "N km away".** The distance line under the cart name is gone; distance still shows on the open carts cards (`/carts`). _Agent: frontend._
- **Dashboard: no "Minimum reached. Waiting for <owner> (<phone>) to accept and pay."** A member's cart card in READY now shows only the "Minimum reached" badge, countdown and "View cart" (`nextStep` in `cart-rules.ts` returns no `text` there). _Agent: frontend._
- **Total box beside Quantity** on the product page's add-to-cart form: shows price × quantity (e.g. 3 × LKR 1,700 = LKR 5,100) and updates as you type. Worked out with `D` from a decimal-string `price` prop, never a JS number. _Agent: frontend._
- **Accepting or declining a join request shows a pop-up.** On Notifications, "Accepted. Their items are now in your cart." and "Declined. Their cart stays as it was." are now a toast at the bottom (hides after 3.5 s, ✕ to close) instead of a banner above the list. Uses `components/toast.tsx`. _Agents: notifications, frontend._
- **"Leave cart" is a red button** with white text on the cart page (was a small grey underlined link), matching the owner's red "Cancel". _Agent: frontend._

## 2026-10-17

- **Join-request notices are just the title.** "<name> wants to join your cart" no longer shows the sentence "<name> asks to move their items into … Accept or decline below." or its time; the Accept / Decline buttons follow the title directly. New requests store an empty body. _Agent: notifications._
- **Message someone asking to join.** The owner's "Asking to join" card has a "Message" button beside Accept / Decline. It opens a chat with that person in `/messages` (empty until the owner writes). Owners still can't start a chat with anyone else; the exception is only while the request is pending (`askingToJoin` / `newThreadWith` in `chat.ts`), and a chat that has started carries on after the request is accepted or declined. The person gets the usual "New message" notice. _Agents: carts, frontend._
- **"Request sent." removed** from the cart page after asking to join; only the "Cancel request" button stays. _Agent: frontend._
- **"Done." is a pop-up.** After sending, accepting, declining or cancelling a join request (`/c/<code>?merge=1`), "Done." now shows as the bottom `Toast` that hides itself after a few seconds, instead of a green box at the top of the cart page. _Agent: frontend._
- **Map no longer covers the phone tab bar.** Scrolling the map pin picker (sign-up, profile, start/join a cart) under the bottom tab bar drew the map on top of the tabs: Leaflet's layers use z-index 400/1000 and the bar is z-20. The map box is now `isolate`, so its layers stay inside it. _Agent: frontend._
- **"Copy cart link" instead of "Share on WhatsApp"** on the buyer dashboard's cart card (shown while the cart is filling). It copies `/c/<code>` and reads "Link copied" for 2 s (`CopyLinkButton` in `components/client.tsx`). Rule 9 updated. _Agents: frontend, grouptogether._
- **Product page fits on phones.** A long cart name in the "Add to" dropdown made the page wider than the screen (image and text cut off on the right). The page's grid columns can now shrink (`min-w-0`) and every `Select` is capped at its container's width. _Agent: frontend._
- **Share icon removed from the cart page.** The round share button beside the cart title (Copy link / Share on WhatsApp) is gone, and the unused `ShareMenu` component was deleted. Buyers share from the dashboard's "Share on WhatsApp" button. Rule 9 updated. _Agents: frontend, grouptogether._
- **Delivery point removed from the cart page.** The "Delivery point" section and its "See delivery point on map" button are gone (`delivery-map.tsx` deleted). The owner's pin is still used for the "N km away" line and the PickMe booking. Rule 14 rewritten. _Agents: frontend, grouptogether._
- **Cart page:** removed "LKR X to go" under the bar (it still says "Minimum reached" once met) and the "Add items" button; members add items from the shop or a product page. _Agent: frontend._
- **Sold-out sizes** show as plain grey size buttons (no strike-through). Picking one shows "Sold" where "N left in stock" goes, and "Add to group cart" is disabled. _Agent: frontend._
- **Product page "Add to" list** shows the cart name only, without the code. _Agent: frontend._
- **"Added to your cart" is a pop-up** (toast at the bottom, hides after 3.5 s, with "View cart" and ✕) instead of a banner in the form. Reusable `components/toast.tsx`. _Agent: frontend._
- **Dashboard progress bar:** removed "LKR X to go"; it shows only "LKR total of LKR minimum". _Agent: frontend._
- **Defects removed completely.** The "Defects: …" box is gone from the product page, the Defects field is gone from the admin and seller product forms, sellers no longer see it, and B-grade products no longer need defects to be saved or submitted for review. B-grade items still carry the "B-grade" badge. `Product.defectNotes` stays in the database, unused, so old notes aren't lost; the seed no longer writes it. Rule 10 rewritten. _Agents: catalogue-admin, frontend, grouptogether, qa-review._
- **Dashboard:** removed "LKR X more to reach the minimum." on an open cart; the progress bar already shows "X to go". _Agent: frontend._
- **Dashboard: "View cart" instead of "Add items".** For an open cart the main button now reads "View cart" and opens the cart page (where "Add items" still is); the extra "View cart →" link under it disappears since the button does the same. Rule: `nextStep` in `cart-rules.ts`. _Agents: frontend, carts._
- **Adding to a cart stays on the product page.** It shows "Added to your cart. View cart" and refreshes the stock count; it no longer jumps to the cart page. _Agent: frontend._
- **"My carts" is now "Past orders"** (`/my-carts`): one line per finished cart (date · status · items · amount ›), no cards, progress bars, repeated names or member counts. Owners see the cart total, members their own items; another owner's cart is labelled "<first name>'s cart". Expired/cancelled carts fold under "Show N expired or cancelled". The active cart is only on the dashboard. _Agents: frontend, carts._
- **Dashboard cart card lines up on every screen.** The status pill ("Minimum reached" etc.) never wraps onto two lines (all `Badge`s are now one line), and on small phones it drops under the cart name instead of squeezing it; the cart name wraps instead of being cut off with "…". The Open / Ready / Paid / Delivered labels are centred under their bars. On phones the main button ("Accept & pay", "Upload bank slip"…) and WhatsApp share are full width and stacked; from 640px up they sit in one row. `CurrentCart` in `src/app/dashboard/page.tsx`, `Badge` in `ui.tsx`. _Agent: frontend._
- **My carts: no repeated "Minimum reached".** The grey "Minimum reached" text under the progress bar is gone (the green status badge already says it); the bar still shows "LKR N to go" until the minimum is reached. `ProgressBar` in `cart-bits.tsx`. _Agent: frontend._
- **Back arrow on My carts.** `/my-carts` now has the same `BackLink` as other pages (goes back, or to `/dashboard` if there's no history). _Agent: frontend._
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
