import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card, EmptyState, Input, LinkButton, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { cartView } from "@/server/orders/cart";
import { setQtyAction } from "./actions";

export const metadata: Metadata = { title: "Cart" };

export default async function CartPage({ searchParams }: PageProps<"/cart">) {
  const user = await requireUser([...BUYER_ROLES], "/cart");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const agent = typeof sp.agent === "string" && /^[a-z0-9]{1,40}$/.test(sp.agent) ? sp.agent : "";
  const { factories } = await cartView(user.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Cart" />
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
                    <div className="flex flex-wrap gap-2">
                      <form action={setQtyAction} className="flex gap-2">
                        <input type="hidden" name="variantId" value={l.variantId} />
                        <input type="hidden" name="agent" value={agent} />
                        <label htmlFor={`qty-${l.itemId}`} className="sr-only">
                          Quantity of {l.title} {l.size}
                        </label>
                        <Input
                          id={`qty-${l.itemId}`}
                          name="qty"
                          type="number"
                          min={1}
                          max={999}
                          defaultValue={l.qty}
                          className="w-20"
                        />
                        <Button type="submit" variant="secondary">
                          Update
                        </Button>
                      </form>
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
                <dt>Courier</dt>
                <dd className="text-right">{formatLKR(f.totals.courier)}</dd>
                <dt>Agent fee</dt>
                <dd className="text-right">{formatLKR(f.totals.agentFee)}</dd>
              </dl>
            </Card>
          ))}
          <LinkButton href={`/checkout${agent ? `?agentId=${agent}` : ""}`}>Checkout</LinkButton>
        </>
      )}
    </div>
  );
}
