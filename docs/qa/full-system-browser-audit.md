# Full-system browser audit

QA and UX audit of GroupBasket in a visible (headed) browser, with fixes. Updated as the run goes.

- **Branch:** `qa/full-system-browser-audit`, from `origin/main` at `73178b4` (2026-11-19).
  PR #19 (own-basket join notice and browser spec) was not merged into this branch; it was
  green but merging was held because this run is not to push or merge.
- **Environment:** local `next dev` on port 3300 against the guarded `groupbasket_test` database
  (checked by `scripts/test-database.mjs`), `PAYMENT_GATEWAY=demo`, uploads in `.data/qa-uploads`.
  Seeded with `prisma db seed`. Synthetic demo accounts only. No real payment or courier.
- **Browser:** Playwright CLI (`npm run browser`, session `qa`), headed Chromium on the laptop
  display, each control highlighted before use. Screenshots in `qa-output/` (git-ignored, not
  committed).
- **Setting changed for the run:** `Settings.ownMinItems` set to 2 in the test database so two
  buyers can reach the minimum.

## Commands

| Command | Result |
| ------- | ------ |
| `npx playwright install chromium` | Installed (owner approved the download). |
| `prisma migrate deploy` + `prisma db seed` (test DB) | No pending migrations; seeded. |
| `npx vitest run src/lib/format.test.ts src/lib/fit/size-order.test.ts` | 4 passed. |
| `npx tsc --noEmit` | Clean after each fix. |
| `npm run check` | Pass: money, doc links, licences, typecheck, lint, tooling (13), unit (252). |
| `npm run build` | Pass. A first attempt failed with `ENOTEMPTY` on `.next/e2e/dev/cache` because the just-stopped QA dev server still held it; the rerun passed. |
| `npm run test:int` | Pass: 37 files, 335 tests. |
| `npm run e2e -- --headed --update-snapshots=missing` | Pass: 53 tests, headed on the laptop display, desktop and 360 px mobile projects (29.8 min). Wrote the two new visual baselines. |
| Visual baselines reviewed | `tests/e2e/visual.spec.ts-snapshots/*-win32.png`: amounts and labels correct, nothing clipped. Accepted. |
| `npx playwright test visual own-baskets --headed` | Pass: 5 tests against the accepted baselines. |

## Coverage

| Flow | Role | Viewport | Result |
| ---- | ---- | -------- | ------ |
| Sign in | Buyer | 1280 | Pass |
| Shop → product → size → quantity → Add to cart → View cart → Checkout | Buyer | 1280 | Pass after QA-001, QA-002 |
| Demo payment → Paid → Orders; order still Paid after reload | Buyer | 1280 | Pass |
| Fit panel (size buttons, recommendation, heatmap toggle) | Buyer | 1280, 360 | Pass; no overflow at 360 |
| Material Card, "How we know this" | Buyer | 1280, 360 | Pass; no overflow at 360 |
| Own basket: start (validation on empty submit, public), demo pay | Buyer 4 | 1280 | Pass |
| Own basket: below minimum, Place order disabled with reason | Buyer 4 | 1280 | Pass after QA-003 |
| Own basket: join from product page public list, address hidden, empty-size error, pay | Buyer 5 | 1280 | Pass |
| Own basket: at minimum, Place order enabled → Packing; survives reload | Buyer 4 | 1280 | Pass |
| Payment return page after own-basket payment | Buyer 6 | 1280 | Pass after QA-004 |
| Factory packing: own basket in To pack with owner address, Mark packed | Lanka packing | 1280 | Pass |
| Courier booking: empty submit (native required), bad fee, valid booking | Agents and orders admin | 1280 | Pass after QA-006 |
| Given to driver → owner sees On the way → Received → Delivered; joiner notices | Lanka packing, buyers 4 and 5 | 1280 | Pass |
| Agent: Mark received, wrong code (kept in field), right code, Hand over needs Fee received | Kollupitiya agent | 1280 | Pass |
| Buyer home after handover | Buyer | 1280 | Pass |
| Every nav page for Agents and orders, Apparel and factories, Core, Brand rewards admins, factory owner and factory sales | Admins, factory | 1280 and 360 | No horizontal overflow, no failed requests; one console error, QA-007 |
| Site icon | All | 1280 | Pass after QA-005 |

## Issues

### QA-001 · Money shown with one decimal (Medium · fixed)

- **User impact:** checkout read "PayHere fee LKR 109.2", "Total LKR 3,309.2". Money with one
  decimal looks wrong and undermines trust at the moment of paying.
- **Steps:** buyer, Running shorts, M × 2, Add to cart, View cart, Checkout (1280 px).
- **Expected / actual:** LKR 109.20 / LKR 109.2.
- **Root cause:** `formatLKR` used `minimumFractionDigits: 0`, so it dropped trailing zeros, not
  just whole-rupee cents.
- **Fix:** `src/lib/format.ts` — whole rupees stay "LKR 1,600"; any amount with cents always has
  two decimals. Shared formatter, so every money figure in the app is corrected.
- **Test:** `src/lib/format.test.ts`. **Retest:** checkout shows LKR 109.20 and LKR 3,309.20
  (`qa-output/04-checkout.png` before, `05-checkout-fixed.png` after).

### QA-002 · Sizes listed alphabetically: L, M, S, XL (Medium · fixed)

- **User impact:** the buy box listed L, M, S, XL, while the fit panel on the same page listed
  S, M, L, XL. Buyers scan sizes small to large, and the mismatch makes it easy to pick wrong.
- **Steps:** any product page, Size group (1280 px).
- **Root cause:** `getProduct` ordered variants by `size` as text. The fit panel used
  `sizeOrder`, but only for garment kinds that list their sizes; unknown kinds fell back to text.
- **Fix:** `src/server/catalogue.ts` sorts variants with `sizeOrder`; `src/lib/fit/data.ts` adds
  `compareSizes` (letter sizes small to large, then numbers) for sizes a kind does not list. The
  own-basket size boxes use the same product data.
- **Test:** `src/lib/fit/size-order.test.ts`. **Retest:** buy box reads S M L XL; own-basket size
  boxes read S M L XL.

### QA-003 · Place order disabled without a reason; "1 items" (Medium · fixed)

- **User impact:** the owner saw a greyed Place order and "1 / 2", which does not say what to do.
  Basket lines said "1 items".
- **Steps:** buyer 4 starts an own basket with 1 item, opens it (1280 px).
- **Fix:** `src/app/own-baskets/[id]/page.tsx` shows "1 more item needed · 1 of 2" beside the
  disabled button and links it with `aria-describedby`; `itemsLabel` in `own-bits.tsx` gives
  "1 item"/"2 items" on the basket page, the My own baskets list and the product page list.
- **Retest:** `qa-output/13-own-owner-below-min.png` before, `19-own-reason-after.png` after; at 2
  of 2 the reason disappears and Place order is enabled.

### QA-004 · After paying into an own basket, the only way on is Orders (Low · fixed)

- **User impact:** the joiner or owner who just paid lands on "Paid" with an Orders button; the
  basket they came from is not one tap away, and own baskets are not under Orders.
- **Fix:** `src/app/checkout/return/[attemptId]/page.tsx` shows **Back to basket** for an
  own-basket payment; agent orders still go to Orders.
- **Retest:** buyer 6 starts a basket, pays, taps Back to basket, lands on the basket
  (`qa-output/18-paid-own-after.png`).

### QA-005 · favicon.ico returns 404 (Low · fixed)

- Every page logged a console 404 for `/favicon.ico` and the tab had no icon.
- **Fix:** `src/app/icon.svg` (basket in the accent green); Next.js links it from every page.
- **Retest:** home page links `/icon.svg`, no 4xx responses.

### QA-006 · Courier booking error wipes everything typed (Medium · fixed)

- **User impact:** an Agents and orders admin typing a fee such as "abc" with the driver, phone
  and vehicle filled in got "Enter a positive courier fee with at most two decimals" and all
  four fields emptied, so they retyped the whole booking.
- **Steps:** Agents and orders admin, a Packed basket, fee "abc", driver, phone, vehicle, Book
  (1280 px).
- **Root cause:** React 19 resets a form after its server action finishes, even when the action
  returns an error. `AdminForm` (22 admin forms) relied on uncontrolled fields.
- **Fix:** `src/app/admin/admin-form.tsx` keeps the submitted text values and puts them back
  when the action returns an error. Success still resets as before.
- **Test:** `tests/e2e/admin-workspaces.spec.ts` ("books a courier") now submits a bad fee
  first and checks driver and vehicle are kept. **Retest:** fee "abc" kept, driver Sunil
  Perera, phone and vehicle kept; correcting the fee books (`qa-output/23-courier-error-after.png`).

### QA-007 · Duplicate React key on Brand rewards (Low · fixed)

- **Steps:** Brand rewards admin, Gift products tab, then Messages. Console: "Encountered two
  children with the same key, `new`".
- **Root cause:** `src/components/brand-inbox.tsx` gave the thread history and the message form
  the same fallback key `"new"` when no conversation is open.
- **Fix:** keys `history-…` and `form-…`. **Retest:** no console error across the four tabs.

### QA-008 · Green Back button competes with the main action (Medium · fixed)

- **User impact:** `BackLink` was a filled accent button on every inner page, as strong as Add
  to cart, Pay or Place order, so first-time users saw two equal "main" buttons. Inside flex
  columns it also stretched the full row width (measured 1128 × 40 px on the product page at
  1280 px), showing as a solid green bar across the page.
- **Root cause:** filled `bg-accent` styling, and `inline-flex` stretched by `align-items:
  stretch` in a column parent.
- **Fix (owner asked 2026-11-19):** `src/components/client.tsx`. Back stays green, as the owner
  chose in `763993c`, but as text with no fill, `w-fit self-start` so it is only as wide as
  its label, a 44 px tap height at 360 px (40 px on wider screens, as the other controls) and a
  visible focus ring. Measured after: 62 × 44 px at 360 px, 62 × 40 px at 1280 px.
- **Retest:** product page at 1280 and 360 px (`qa-output/01-product.png` before,
  `26-back-after-1280.png` and `27-back-focus-360.png` after); Back still returns to Shop.
  `accessibility`, `buyer` and `own-baskets` specs: 15 passed.

### QA-009 · No way back to the cart except the toast (High · fixed)

- **User impact:** after "Added to cart" closed, a buyer had no visible route to the cart; the
  Orders tab led there only through a button, and the cart was not in the top bar or tab bar.
- **Why the audit missed it:** every scripted cart visit used the toast's View cart link or
  went to `/cart` directly, so the test path always had a way in. The audit checked each screen
  but not "can I get back here from anywhere" as a navigation question.
- **Fix:** `src/components/site-header.tsx` adds a Cart icon with a unit count beside the bell
  for shoppers on every page, phone and desktop; Orders gets its own parcel icon. Add to cart and
  quantity changes revalidate the layout so the count updates.
- **Test:** `tests/e2e/buyer.spec.ts` opens the cart from the header on Shop. `buyer` and
  `accessibility` specs: 12 passed, headed.

## Added coverage

- `tests/e2e/own-baskets.spec.ts` (from PR #19, adapted): two buyers; owner starts a public
  basket, Place order disabled with "1 more item needed · 1 of 2" as its description, joiner
  joins from the product page without seeing the address, Back to basket after paying, owner
  places the order at the minimum and the state survives reload. Axe and 360 px overflow on
  each screen. The join-notice assertion stays with PR #19, which adds that notice.
- `tests/e2e/visual.spec.ts`: screenshot comparisons of the Material Card and the checkout
  summary at 360 px, light mode, reduced motion. Skipped on CI: baselines are per platform and
  only Windows baselines have been reviewed.

## Not a bug

- Product page shows "Lanka Knit Works" twice: once as the product's brand and once as the
  factory. The seed data sets the brand to the factory name.

## Not verified

- **Real phone and camera:** the fit-lab capture and body scan need a physical camera; checked
  only in desktop Chromium and the 360 px emulator.
- **Throttled network and slow responses:** not reproduced under throttling in this run.
- **Keyboard-only pass and dialog focus return:** axe ran on every e2e screen; a manual
  keyboard walk of every flow was not done.
- **Other browsers:** Chromium only; no Firefox or WebKit.
- **Parked features (not bugs):** preorders (`DEC-015`), premium-brand partnership
  communication, Parcel is back / courier rebooking (`DEC-016`).
- **Visual baselines on CI:** Linux baselines not made; the visual spec skips on CI.
