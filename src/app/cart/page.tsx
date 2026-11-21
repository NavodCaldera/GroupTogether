import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { BackLink } from "@/components/client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { ownFromCartAction } from "@/app/own-baskets/actions";
import { itemsLabel, TokensField } from "@/app/own-baskets/own-bits";
import { nearestAgents, openNow } from "@/lib/agent-rules";
import { parseItems } from "@/lib/cart-items";
import { formatDistance } from "@/lib/distance";
import { formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { liveAgents } from "@/server/agents/live";
import { buyerPin } from "@/server/orders/buyer";
import { cartView } from "@/server/orders/cart";
import { myOpenOwnBaskets, publicOwnBaskets } from "@/server/orders/own-baskets";
import { tokenBalance } from "@/server/tokens";
import { setQtyAction } from "./actions";
import { Choices, SelectAll, type Picked } from "./cart-select";
import { QtyStepper } from "./qty-stepper";

export const metadata: Metadata = { title: "Cart" };

const FORM = "cart-pick";
const PANEL = "cart-panel";
const HOWS = ["agent", "mine", "join"] as const;
type How = (typeof HOWS)[number];

const radioCard =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3 has-checked:border-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30";
const radio = "mt-1 h-5 w-5 shrink-0 accent-(--accent)";

/** Tick items (all by default), then send them by Agent pickup, My basket or Join a basket
 * (DEC-027). The ticks and the choice travel in the URL (`sel`, `how`). */
export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const user = await requireUser([...BUYER_ROLES], "/cart");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const agent = typeof sp.agent === "string" && /^[a-z0-9]{1,40}$/.test(sp.agent) ? sp.agent : "";
  const { factories } = await cartView(user.id);

  const lines = factories.flatMap((f) => f.lines.map((l) => ({ ...l, factoryId: f.factoryId })));
  const open = lines.filter((l) => l.available);
  // Nothing in the URL yet: everything that can be bought is ticked.
  const asked = sp.picked || sp.sel ? new Set(parseItems(sp.sel) ?? []) : null;
  const ticked = open.filter((l) => !asked || asked.has(l.variantId));
  const tickedFactories = [...new Set(ticked.map((l) => l.factoryId))];
  const how = HOWS.find((h) => h === sp.how) ?? null;
  const panel: How | null =
    how && ticked.length && (how === "agent" || tickedFactories.length === 1) ? how : null;
  const factoryId = tickedFactories.length === 1 ? tickedFactories[0]! : null;
  const items = ticked.map((l) => l.variantId);
  const initial: Picked = {
    ids: items,
    factories: tickedFactories.length,
    cents: ticked.reduce((s, l) => s + l.unitPrice.times(l.qty).times(100).toNumber(), 0),
    all: open.length,
  };

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
          <form id={FORM} action="/cart" method="get">
            <input type="hidden" name="picked" value="1" />
            {agent && <input type="hidden" name="agent" value={agent} />}
          </form>
          {open.length > 0 && <SelectAll formId={FORM} initial={initial} />}
          {factories.map((f) => (
            <Card key={f.factoryId} className="flex flex-col gap-3">
              <h2 className="font-semibold">{f.name}</h2>
              <ul className="flex flex-col divide-y divide-line">
                {f.lines.map((l) => (
                  <li key={l.itemId} className="flex gap-1 py-3 first:pt-0 last:pb-0">
                    <label className="-ml-3 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-start justify-center pt-0.5">
                      <input
                        type="checkbox"
                        name="sel"
                        value={l.variantId}
                        form={FORM}
                        defaultChecked={l.available && ticked.some((t) => t.itemId === l.itemId)}
                        disabled={!l.available}
                        data-factory={f.factoryId}
                        data-cents={l.unitPrice.times(l.qty).times(100).toFixed(0)}
                        aria-label={`${l.title} ${l.size}`}
                        className="h-5 w-5 accent-(--accent)"
                      />
                    </label>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
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
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          {open.length > 0 && (
            <Card className="flex flex-col gap-4">
              <Choices
                formId={FORM}
                how={panel}
                initial={initial}
                shown={panel ? items : []}
                panelId={PANEL}
              />
              {panel && (
                <div id={PANEL} className="flex flex-col gap-4 border-t border-line pt-4">
                  {panel === "agent" && <AgentPanel userId={user.id} agent={agent} items={items} />}
                  {panel !== "agent" && factoryId && (
                    <BasketPanel userId={user.id} how={panel} factoryId={factoryId} items={items} />
                  )}
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** The nearest agents (three, plus one chosen further away), then Checkout. */
async function AgentPanel({
  userId,
  agent,
  items,
}: {
  userId: string;
  agent: string;
  items: string[];
}) {
  const [pin, agents] = await Promise.all([buyerPin(userId), liveAgents()]);
  const ranked = nearestAgents(pin, agents);
  const nearest = [...ranked.slice(0, 3), ...ranked.filter((a, i) => i >= 3 && a.id === agent)];
  const chosen = nearest.find((a) => a.id === agent) ?? nearest[0];
  const now = new Date();
  if (!chosen) return <p className="text-sm text-subtle">No agent is taking orders</p>;
  return (
    <form action="/checkout" method="get" className="flex flex-col gap-2">
      <input type="hidden" name="items" value={items.join(",")} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Agent</legend>
        {nearest.map((a) => (
          <label key={a.id} className={radioCard}>
            <input
              type="radio"
              name="agentId"
              value={a.id}
              defaultChecked={a.id === chosen.id}
              className={radio}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{a.user.name}</span>
                <Badge tone={openNow(a.hours, now) ? "good" : "neutral"}>
                  {openNow(a.hours, now) ? "Open now" : "Closed"}
                </Badge>
              </span>
              <span className="text-sm">{[a.address, a.city].filter(Boolean).join(", ")}</span>
              {a.distanceKm !== null && (
                <span className="text-sm text-subtle">{formatDistance(a.distanceKm)}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" className="mt-1 self-start">
        Checkout
      </Button>
    </form>
  );
}

/** My basket: the buyer's open baskets of this factory and New basket. Join a basket: other
 * buyers' public baskets of this factory. Then tokens and Pay. */
async function BasketPanel({
  userId,
  how,
  factoryId,
  items,
}: {
  userId: string;
  how: "mine" | "join";
  factoryId: string;
  items: string[];
}) {
  const [baskets, balance, profile] = await Promise.all([
    how === "mine" ? myOpenOwnBaskets(userId, factoryId) : publicOwnBaskets(factoryId, userId),
    tokenBalance(userId),
    how === "mine"
      ? db.user.findUnique({
          where: { id: userId },
          select: { address: true, city: true, phone: true },
        })
      : null,
  ]);
  if (how === "join" && baskets.length === 0)
    return <p className="font-medium">No basket to join</p>;
  return (
    <form action={ownFromCartAction} className="flex flex-col gap-4">
      <input type="hidden" name="items" value={items.join(",")} />
      <input type="hidden" name="how" value={how} />
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Basket</legend>
        {baskets.map((b, i) => (
          <label key={b.id} className={radioCard}>
            <input
              type="radio"
              name="basketId"
              value={b.id}
              defaultChecked={i === 0}
              className={radio}
            />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">
                {how === "join" ? `${b.owner} · ${b.area}` : b.area}
              </span>
              <span className="text-sm text-subtle tabular-nums">{itemsLabel(b.items)}</span>
            </span>
          </label>
        ))}
        {how === "mine" && (
          <div className="flex flex-wrap items-start gap-x-3 rounded-xl border border-line bg-paper p-3">
            <input
              id="new-basket"
              type="radio"
              name="basketId"
              value="new"
              defaultChecked={baskets.length === 0}
              className={`peer ${radio}`}
            />
            <label htmlFor="new-basket" className="min-w-0 flex-1 cursor-pointer font-semibold">
              New basket
            </label>
            <div className="hidden w-full flex-col gap-3 pt-3 peer-checked:flex">
              <Field label="Delivery address" name="address">
                <Textarea
                  id="address"
                  name="address"
                  maxLength={300}
                  rows={3}
                  defaultValue={profile?.address ?? ""}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Town or area" name="area">
                  <Input id="area" name="area" maxLength={60} defaultValue={profile?.city ?? ""} />
                </Field>
                <Field label="Phone" name="phone">
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    maxLength={30}
                    defaultValue={profile?.phone ?? ""}
                  />
                </Field>
              </div>
              <Field label="Who can join" name="visibility">
                <Select id="visibility" name="visibility" defaultValue="LINK">
                  <option value="LINK">People with the link</option>
                  <option value="PUBLIC">Anyone</option>
                </Select>
              </Field>
            </div>
          </div>
        )}
      </fieldset>
      {balance.gt(0) && <TokensField />}
      <Button type="submit" className="self-start">
        Pay
      </Button>
    </form>
  );
}
