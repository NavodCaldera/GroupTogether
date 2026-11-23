# GroupBasket

Start with [AGENTS.md](AGENTS.md), then the [operating brief](.claude/agents/groupbasket.md).

GroupBasket is group buying of family packs (`DEC-030`, 2026-11-23). From 2026-11-24 there are no
categories: the home page lists every company (shown by brand logo), and each company has two fixed standard packs, Budget and
Premium, both 30 days for a family of 4. The family starting a basket picks 5, 10 or 15
families; each size has the company's discount %, and the basket's size and price never change. A company login manages its banner, logo, pack
photos, pack versions (items with photos and shop prices) and orders at `/company`. Families within 1 km of
each other fill a basket. The first family to pay owns it and receives the delivery. Everyone
pays when they join. A full basket places one order with the company. An unfilled basket is
extended twice, then closed with token refunds. From 2026-11-24 buyers can resell unopened,
shelf-stable items from a full basket at what they paid (`DEC-031`, `/reselling`), paid at pickup.

On 2026-11-23 the code was cut down to this model only. Agents, carts, orders, factories,
brands, 3D fit, materials, deals, returns, and the admin and seller areas were all removed;
they are saved at the `any-product-pivot-2026-11-23` tag. `main` is protected: changes land
only through a pull request with green checks.
