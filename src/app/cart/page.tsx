import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import Link from "next/link";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { itemsLabel } from "@/app/own-baskets/own-bits";
import { nearestAgents, openNow } from "@/lib/agent-rules";
import { formatDistance } from "@/lib/distance";
import { formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { liveAgents } from "@/server/agents/live";
import { buyerPin } from "@/server/orders/buyer";
import { cartView } from "@/server/orders/cart";
import { publicOwnBaskets } from "@/server/orders/own-baskets";
import { setQtyAction } from "./actions";
import { QtyStepper } from "./qty-stepper";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const user = await requireUser([...BUYER_ROLES], "/cart");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const agent = typeof sp.agent === "string" && /^[a-z0-9]{1,40}$/.test(sp.agent) ? sp.agent : "";
  const [{ factories }, pin, agents] = await Promise.all([
    cartView(user.id),
    buyerPin(user.id),
    liveAgents(),
  ]);
  const products = [
    ...new Map(
      factories.flatMap((f) => f.lines).map((l) => [l.productId, l.title] as const),
    ).entries(),
  ];
  const baskets = await Promise.all(products.map(([id]) => publicOwnBaskets(id)));
  const ranked = nearestAgents(pin, agents);
  const nearest = [...ranked.slice(0, 3), ...ranked.filter((a, i) => i >= 3 && a.id === agent)];
  const chosen = nearest.find((a) => a.id === agent) ?? nearest[0];
  const now = new Date();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <BackLink fallback="/shop" />
        <PageHeader title="Cart" />
      </div>
      {error && <Alert>{error}</Alert>}
      {factories.length === 0 ? (
        <EmptyState title="Your cart is empty">
          <Link href="/shop" className="font-medium text-accent underline">
            Shop
          </Link>
        </EmptyState>
      ) : (
        <>
          {factories.map((f) => (
            <Card key={f.factoryId} className="flex flex-col gap-3">
              <h2 className="font-semibold">{f.name}</h2>
              <ul className="flex flex-col divide-y divide-line">
                {f.lines.map((l) => (
                  <li key={l.itemId} className="flex flex-col gap-2 py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${l.productId}`}
                          className="font-medium hover:underline"
                        >
                          {l.title}
                        </Link>
                        <p className="text-sm text-subtle">
                          {[l.size, l.colour].filter(Boolean).join(" · ")} ·{" "}
                          {formatLKR(l.unitPrice)}
                        </p>
                        {!l.available && (
                          <p className="text-sm font-medium text-danger">No longer available</p>
                        )}
                        {l.available && l.inStock < l.qty && (
                          <p className="text-sm font-medium text-danger">Only {l.inStock} left</p>
                        )}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">
                        {formatLKR(l.unitPrice.times(l.qty))}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <QtyStepper
                        key={l.qty}
                        variantId={l.variantId}
                        agent={agent}
                        qty={l.qty}
                        label={`${l.title} ${l.size}`}
                      />
                      <form action={setQtyAction}>
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="agent" value={agent} />
                        <input type="hidden" name="qty" value="0" />
                        <Button
                          type="submit"
                          variant="ghost"
                          aria-label={`Remove ${l.title} ${l.size}`}
                        >
                          Remove
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-line pt-3 text-sm tabular-nums">
                <dt>Item</dt>
                <dd className="text-right">{formatLKR(f.totals.items)}</dd>
                <dt className="text-subtle">Agent fee at pickup</dt>
                <dd className="text-right text-subtle">{formatLKR(f.totals.cashFee)}</dd>
              </dl>
            </Card>
          ))}
          <h2 className="mt-2 text-lg font-semibold">Get it by</h2>
          <Card className="flex flex-col gap-3">
            <h3 className="font-semibold">Agent pickup</h3>
            {chosen ? (
              <form action="/checkout" method="get" className="flex flex-col gap-2">
                {nearest.map((a) => (
                  <label
                    key={a.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3 has-checked:border-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30"
                  >
                    <input
                      type="radio"
                      name="agentId"
                      value={a.id}
                      defaultChecked={a.id === chosen.id}
                      className="mt-1 h-5 w-5 shrink-0 accent-(--accent)"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.user.name}</span>
                        <Badge tone={openNow(a.hours, now) ? "good" : "neutral"}>
                          {openNow(a.hours, now) ? "Open now" : "Closed"}
                        </Badge>
                      </span>
                      <span className="text-sm">
                        {[a.address, a.city].filter(Boolean).join(", ")}
                      </span>
                      {a.distanceKm !== null && (
                        <span className="text-sm text-subtle">{formatDistance(a.distanceKm)}</span>
                      )}
                    </span>
                  </label>
                ))}
                <Button type="submit" className="mt-1 self-start">
                  Checkout
                </Button>
              </form>
            ) : (
              <p className="text-sm text-subtle">No agent is taking orders</p>
            )}
          </Card>
          {products.map(([productId, title], i) => (
            <Card key={productId} className="flex flex-col gap-3">
              <h3 className="font-semibold">Own basket · {title}</h3>
              {baskets[i].length > 0 && (
                <ul className="flex flex-col divide-y divide-line">
                  {baskets[i].map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1"
                    >
                      <span className="text-sm">
                        <span className="font-medium">{b.area}</span>
                        <span className="text-subtle">
                          {" "}
                          · {b.owner} · {itemsLabel(b.items)}
                        </span>
                      </span>
                      <LinkButton
                        href={`/own-baskets/${b.id}`}
                        variant="secondary"
                        aria-label={`Join ${b.owner}'s basket in ${b.area}`}
                      >
                        Join
                      </LinkButton>
                    </li>
                  ))}
                </ul>
              )}
              <LinkButton
                href={`/own-baskets/new?product=${productId}`}
                variant="secondary"
                className="self-start"
              >
                Start own basket
              </LinkButton>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
