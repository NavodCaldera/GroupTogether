# GroupBasket

Start with [AGENTS.md](AGENTS.md), then the [operating brief](.claude/agents/groupbasket.md).

GroupBasket is group buying of family packs (`DEC-030`, 2026-11-23). Companies are listed under
categories, and each company has fixed standard packs for one family. Families within 1 km of
each other fill a basket. The first family to pay owns it and receives the delivery. Everyone
pays when they join. A full basket places one order with the company. An unfilled basket is
extended twice, then closed with token refunds.

On 2026-11-23 the code was cut down to this model only. Agents, carts, orders, factories,
brands, 3D fit, materials, deals, returns, and the admin and seller areas were all removed;
they are saved at the `any-product-pivot-2026-11-23` tag. `main` is protected: changes land
only through a pull request with green checks.
