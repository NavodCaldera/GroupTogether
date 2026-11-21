# GroupBasket

Start with [AGENTS.md](AGENTS.md) for read order, engineering standards, documentation
ownership and specialist routing. Then read the [operating brief](.claude/agents/groupbasket.md)
for business scope, participants and stable policy IDs.

Own baskets (`BSK-008`, `DEC-023`, 2026-11-18) are a second basket kind with no agent: code that
reads an order's or basket's agent must handle null. They charge no delivery fee (the owner pays
the courier on delivery) and can be ordered only once they hold `ownMinItems` items. Buyers start or join one from the Cart
("Get it by"), not the product page.

Buyers give gender and date of birth at sign-up (`DEC-025`, 2026-11-21); the shop shows only
their own audience plus unisex products, with no Audience box. Orders show four stages (Filling,
Packing, On the way, Delivered; Refunded for own baskets past their 10-day wait) and a paid order
can never be cancelled by a buyer (`DEC-026`, 2026-11-21). `main` is protected on GitHub:
changes land only through a pull request with green, up-to-date checks.

Check [implementation status](docs/implementation-status.md) before claiming a feature
exists and [decisions](docs/decisions.md) before filling in unresolved commercial rules.
Specialist files provide technical guidance; historical notes do not override current policy.

Anything new is built on its own branch from `origin/main`, merged through a pull request
once GitHub checks pass (see the branch rule in [AGENTS.md](AGENTS.md)).
