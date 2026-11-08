import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { CopyLinkButton } from "@/components/client";
import { Badge, Card, LinkButton } from "@/components/ui";
import { formatHours, mapLink } from "@/lib/agent-hours";
import { formatDate, formatLKR } from "@/lib/format";
import type { SessionUser } from "@/server/auth/service";
import { listProducts } from "@/server/catalogue";
import { appUrl } from "@/server/notify";
import { buyerHome, orderTotal } from "@/server/orders/buyer";
import { BasketProgress, OrderBadge, factoryName } from "./orders/order-bits";

/** Buyer home, most important first: ready to collect, returns to hand over, orders, tokens, shop. */
export async function BuyerHome({ user }: { user: SessionUser }) {
  const [home, products] = await Promise.all([buyerHome(user.id), listProducts({}, 4, "cheapest")]);
  const shop = (
    <section aria-labelledby="home-shop" className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h2 id="home-shop" className="text-lg font-semibold">
          Shop
        </h2>
        <Link
          href="/shop"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent sm:min-h-10"
        >
          Shop all →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {products.map((p) => (
          <Link key={p.id} href={`/products/${p.id}`} className="group">
            <ProductImage {...p} />
            <p className="mt-2 line-clamp-1 text-sm font-medium group-hover:underline">{p.title}</p>
            <p className="text-sm font-semibold">{formatLKR(p.price)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
  const noOrders = home.orders.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Hi, {user.name.split(" ")[0]}</h1>
      {noOrders && shop}

      {home.ready.length > 0 && (
        <section aria-labelledby="home-ready" className="flex flex-col gap-3">
          <h2 id="home-ready" className="text-lg font-semibold">
            Ready to collect
          </h2>
          {home.ready.map((r) => (
            <Card key={r.agent.id} className="flex flex-col gap-3">
              <p
                className="font-mono text-5xl font-bold tracking-[0.2em] tabular-nums"
                aria-label={`Pickup code ${r.code.split("").join(" ")}`}
              >
                {r.code}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{r.agent.user.name}</p>
                <Badge tone={r.open ? "good" : "neutral"}>{r.open ? "Open now" : "Closed"}</Badge>
                <span className="text-sm text-subtle">
                  {r.pieces} item{r.pieces === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm">
                {[r.agent.address, r.agent.city].filter(Boolean).join(", ")}
              </p>
              {r.agent.hours.length > 0 && (
                <p className="text-sm text-subtle">{formatHours(r.agent.hours)}</p>
              )}
              <LinkButton
                href={mapLink(r.agent)}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                className="self-start"
              >
                Map ↗
              </LinkButton>
            </Card>
          ))}
        </section>
      )}

      {home.handovers.length > 0 && (
        <section aria-labelledby="home-returns" className="flex flex-col gap-3">
          <h2 id="home-returns" className="text-lg font-semibold">
            Return to hand over
          </h2>
          {home.handovers.map((r) => (
            <Card key={r.id} className="flex flex-col gap-1">
              <p className="font-semibold">
                {r.orderLine?.variant.product.title} × {r.qty}
              </p>
              <p className="text-sm">
                {r.handoverAgent?.user.name}
                {r.handoverAgent &&
                  ` · ${[r.handoverAgent.address, r.handoverAgent.city].filter(Boolean).join(", ")}`}
              </p>
              <p className="text-sm text-warn">Due {formatDate(r.handoverDueAt)}</p>
            </Card>
          ))}
        </section>
      )}

      {!noOrders && (
        <section aria-labelledby="home-orders" className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <h2 id="home-orders" className="text-lg font-semibold">
              My orders
            </h2>
            <Link
              href="/orders"
              className="inline-flex min-h-11 items-center text-sm font-medium text-accent sm:min-h-10"
            >
              All orders →
            </Link>
          </div>
          {home.orders.map((o) => {
            const productId = o.lines[0]?.variant.product.id;
            return (
              <Card key={o.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-semibold underline-offset-2 hover:underline"
                  >
                    {factoryName(o.factory)}
                  </Link>
                  <OrderBadge
                    status={o.status}
                    collected={o.lines.every((l) => l.collectedAt || l.status !== "ACTIVE")}
                  />
                </div>
                <p className="text-sm text-subtle">
                  {o.agent.user.name} · {formatLKR(orderTotal(o))}
                </p>
                {o.basket && <BasketProgress basket={o.basket} lockAt={home.lockAt} />}
                {o.basket?.status === "OPEN" && productId && (
                  <CopyLinkButton
                    url={appUrl(`/products/${productId}?agent=${o.agentId}`)}
                    label="Share basket"
                    className="self-start"
                  />
                )}
              </Card>
            );
          })}
        </section>
      )}

      <section aria-labelledby="home-tokens" className="flex flex-col gap-3">
        <h2 id="home-tokens" className="text-lg font-semibold">
          Tokens
        </h2>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-2xl font-semibold tabular-nums">{formatLKR(home.balance)}</p>
          <LinkButton href="/tokens" variant="secondary">
            Send
          </LinkButton>
        </Card>
      </section>

      {!noOrders && shop}
    </div>
  );
}
