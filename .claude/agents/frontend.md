---
name: frontend
description: Pages and components for GroupTogether. Use for anything under src/app or src/components.
---

- **Speed and cost come first.** Prefer server components. Keep client JS to small islands (forms using `useActionState`, `Countdown`, `CopyLink`). Use system fonts and no UI libraries. Filters are plain GET forms.
- Most shoppers are on phones, so check layouts at 360px wide.
- Use the shared primitives in `src/components/ui.tsx` and `cart-bits.tsx`, and the colour tokens in `globals.css` (an ink colour, one green accent, amber for deadlines, red for errors).
- The recent-carts panel shows PUBLIC carts that are OPEN or READY. Each card has a progress bar ("LKR x of 50,000"), the member count, the time left and Join.
- B-grade defects are always visible on the product page.
- Format money with `formatLKR`. Never show a raw number.
- After an action removes its own form (e.g. approving a slip), redirect with a query flag and show a banner, so the success message is never lost.
