import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { nearestAgents, openNow } from "@/lib/agent-rules";
import { D } from "@/lib/decimal";
import { formatDistance } from "@/lib/distance";
import { formatLKR } from "@/lib/format";
import { validCommission } from "@/lib/price-rules";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { CartError } from "@/server/errors";
import { liveAgents } from "@/server/agents/live";
import { buyerPin } from "@/server/orders/buyer";
import { cartView } from "@/server/orders/cart";
import { quoteCheckout } from "@/server/orders/checkout";
import { tokenBalance } from "@/server/tokens";
import { payAction } from "./actions";

export const metadata: Metadata = { title: "Checkout" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() : "");

type Quote = Awaited<ReturnType<typeof quoteCheckout>>;

async function quoteOrNull(buyerId: string, agentId: string, tokens: string) {
  try {
    return { quote: await quoteCheckout(buyerId, agentId, tokens), error: null };
  } catch (e) {
    if (!(e instanceof CartError)) throw e;
    return { quote: null, error: e.message };
  }
}

/** Agent first (nearest selected), then the price lines from quoteCheckout, then Pay. */
export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const user = await requireUser([...BUYER_ROLES], "/checkout");
  const sp = await searchParams;
  const [pin, agents, cart, balance] = await Promise.all([
    buyerPin(user.id),
    liveAgents(),
    cartView(user.id),
    tokenBalance(user.id),
  ]);
  if (cart.factories.length === 0)
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <PageHeader title="Checkout" />
        <EmptyState title="Your cart is empty">
          <Link href="/shop" className="font-medium text-accent underline">
            Shop
          </Link>
        </EmptyState>
      </div>
    );

  const now = new Date();
  const ranked = nearestAgents(pin, agents);
  const chosen = ranked.find((a) => a.id === one(sp.agentId)) ?? ranked[0];
  let error = one(sp.error) || null;
  let tokens = one(sp.tokens) || "0";
  if (!validCommission(tokens)) {
    error ??= "Enter tokens as an amount with at most two decimals";
    tokens = "0";
  }

  let quote: Quote | null = null;
  if (chosen) {
    const first = await quoteOrNull(user.id, chosen.id, tokens);
    quote = first.quote;
    error ??= first.error;
    if (!quote && tokens !== "0") {
      tokens = "0";
      quote = (await quoteOrNull(user.id, chosen.id, "0")).quote;
    }
  }

  const sum = (pick: (q: Quote, i: number) => D) =>
    quote ? quote.orders.reduce((s, _o, i) => s.plus(pick(quote, i)), new D(0)) : new D(0);
  const usedTokens = sum((q, i) => q[i].tokens);
  const total = sum((q, i) => q[i].due);
  const lines: [string, D][] = [
    ["Item", sum((q, i) => q.orders[i].items)],
    ["Courier", sum((q, i) => q.orders[i].courier)],
    ["Agent fee", sum((q, i) => q.orders[i].agentFee)],
    ["Tokens", usedTokens.neg()],
    ["PayHere fee", sum((q, i) => q[i].fee)],
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Checkout" />
      {error && <Alert>{error}</Alert>}
      {!chosen ? (
        <EmptyState title="No agent is taking orders" />
      ) : (
        <form action="/checkout" method="get" className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-lg font-semibold">Agent</legend>
            {ranked.map((a) => {
              const open = openNow(a.hours, now);
              return (
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
                      <Badge tone={open ? "good" : "neutral"}>{open ? "Open now" : "Closed"}</Badge>
                    </span>
                    <span className="text-sm">
                      {[a.address, a.city].filter(Boolean).join(", ")}
                    </span>
                    {a.distanceKm !== null && (
                      <span className="text-sm text-subtle">{formatDistance(a.distanceKm)}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {balance.gt(0) && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="tokens" className="text-sm font-bold">
                Tokens ({formatLKR(balance)})
              </label>
              <div className="flex gap-2">
                <Input
                  id="tokens"
                  name="tokens"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max={balance.toFixed(2)}
                  defaultValue={tokens === "0" ? "" : tokens}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="secondary">
                  Apply
                </Button>
              </div>
            </div>
          )}

          {quote && (
            <Card>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 tabular-nums">
                {lines.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt>{label}</dt>
                    <dd className="text-right">{formatLKR(value)}</dd>
                  </div>
                ))}
                <dt className="border-t border-line pt-2 text-lg font-semibold">Total</dt>
                <dd className="border-t border-line pt-2 text-right text-lg font-semibold">
                  {formatLKR(total)}
                </dd>
              </dl>
            </Card>
          )}

          <input type="hidden" name="requestKey" value={randomUUID()} />
          <input type="hidden" name="quotedTokens" value={usedTokens.toFixed(2)} />
          {quote && (
            <Button type="submit" formAction={payAction} className="w-full">
              Pay
            </Button>
          )}
        </form>
      )}
    </div>
  );
}
