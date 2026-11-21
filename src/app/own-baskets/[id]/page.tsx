import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/cart-bits";
import { BackLink, CopyLinkButton } from "@/components/client";
import { FillBar, StepTrack } from "@/components/step-track";
import { Alert, Badge, Button, Card, Field, Select } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { isBuyerRole } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { appUrl } from "@/server/notify";
import { ownBasketView } from "@/server/orders/own-baskets";
import {
  closeOwnBasketAction,
  confirmDeliveryAction,
  joinOwnBasketAction,
  setVisibilityAction,
} from "../actions";
import { cartQtyForProduct } from "@/server/orders/cart";
import { itemsLabel, OWN_STEPS, ownStep, SizeQuantities, TokensField } from "../own-bits";

export const metadata: Metadata = { title: "Own basket" };

export default async function OwnBasketPage({
  params,
  searchParams,
}: PageProps<"/own-baskets/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const code = typeof sp.code === "string" ? sp.code : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const user = await getCurrentUser();
  const b = await ownBasketView(id, user?.id ?? null, code);
  if (!b) notFound();
  const buyer = !!user && isBuyerRole(user.role);
  const inCart = user && b.canJoin ? await cartQtyForProduct(user.id, b.product.id) : {};
  const here = `/own-baskets/${b.id}${code ? `?code=${encodeURIComponent(code)}` : ""}`;
  const step = ownStep(b.status);
  const open = b.status === "OPEN";
  const need = Math.max(b.minItems - b.items, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink
          fallback={b.isOwner || b.orders.length ? "/own-baskets" : `/products/${b.product.id}`}
        />
        <div className="flex items-start gap-3">
          <div className="w-16 shrink-0">
            <ProductImage {...b.product} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
                <Link
                  href={`/products/${b.product.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  {b.product.title}
                </Link>
              </h1>
              {step === null && (
                <span className="mt-1.5 shrink-0">
                  <Badge tone={b.status === "CANCELLED" ? "bad" : "good"}>
                    {b.status === "CANCELLED" ? "Cancelled" : "Delivered"}
                  </Badge>
                </span>
              )}
            </div>
            <p className="text-sm text-subtle tabular-nums">
              {formatLKR(b.product.price)} · {itemsLabel(b.items)}
            </p>
          </div>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}

      {step !== null && (
        <Card className="flex flex-col gap-4">
          <StepTrack steps={OWN_STEPS} step={step} label="Basket progress steps" />
          {open && (
            <>
              <FillBar value={b.items / Math.max(b.minItems, 1)} label="Basket progress" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!b.isOwner && (
                  <p className="text-sm text-subtle tabular-nums">
                    <strong className="text-ink">{b.items}</strong> of {b.minItems} ·{" "}
                    {need > 0 ? `needs ${need}` : "ready to order"}
                  </p>
                )}
                {b.isOwner && b.shareCode && (
                  <CopyLinkButton
                    url={appUrl(`/own-baskets/${b.id}?code=${b.shareCode}`)}
                    label="Copy basket link"
                  />
                )}
              </div>
            </>
          )}
          {b.isOwner && b.status === "WITH_COURIER" && (
            <form action={confirmDeliveryAction}>
              <input type="hidden" name="basketId" value={b.id} />
              <Button type="submit">Received</Button>
            </form>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-subtle uppercase">Delivery</p>
        <h2 className="font-semibold">
          {b.isOwner ? "You" : b.owner} · {b.area}
        </h2>
        {b.isOwner && (
          <p className="text-sm break-words">
            {b.address} · {b.phone}
          </p>
        )}
      </Card>

      {b.isOwner && open && (
        <Card className="flex flex-col gap-4">
          <form action={setVisibilityAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="basketId" value={b.id} />
            <Field label="Who can join" name="visibility">
              <Select id="visibility" name="visibility" defaultValue={b.visibility ?? "LINK"}>
                <option value="LINK">People with the link</option>
                <option value="PUBLIC">Anyone</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
          <form
            action={closeOwnBasketAction}
            className="flex flex-wrap items-center gap-3 border-t border-line pt-4"
          >
            <input type="hidden" name="basketId" value={b.id} />
            <Button
              type="submit"
              disabled={b.items < b.minItems}
              aria-describedby={b.items < b.minItems ? "own-needed" : undefined}
            >
              Place order
            </Button>
            {b.items < b.minItems && (
              <span id="own-needed" className="text-sm text-subtle tabular-nums">
                {b.minItems - b.items} more {b.minItems - b.items === 1 ? "item" : "items"} needed ·{" "}
                {b.items} of {b.minItems}
              </span>
            )}
          </form>
        </Card>
      )}

      {b.orders.length > 0 && (
        <section aria-labelledby="own-orders" className="flex flex-col gap-2">
          <h2 id="own-orders" className="text-lg font-semibold">
            {b.isOwner ? "Buyers" : "Your items"}
          </h2>
          <Card>
            <ul className="flex flex-col divide-y divide-line">
              {b.orders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  {o.mine ? (
                    <Link
                      href={`/orders/${o.id}`}
                      className="inline-flex min-h-11 items-center font-medium underline-offset-2 hover:underline sm:min-h-10"
                    >
                      {b.isOwner ? "You" : "Your order"} ›
                    </Link>
                  ) : (
                    <span className="font-medium">{o.buyer}</span>
                  )}
                  <span className="flex flex-wrap justify-end gap-1.5">
                    {o.lines.map((l, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-muted px-2 py-0.5 text-sm tabular-nums"
                      >
                        {[l.size, l.colour].filter(Boolean).join(" · ")} × {l.qty}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {b.canJoin && (
        <Card>
          {buyer ? (
            <form action={joinOwnBasketAction} className="flex flex-col gap-5">
              <h2 className="font-semibold">
                {b.isOwner || b.orders.some((o) => o.mine) ? "Add more" : "Join"}
              </h2>
              <input type="hidden" name="basketId" value={b.id} />
              {code && <input type="hidden" name="code" value={code} />}
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <SizeQuantities
                price={b.product.price}
                variants={b.product.variants}
                initial={inCart}
              />
              <TokensField />
              <Button type="submit" className="self-start">
                Pay and add
              </Button>
            </form>
          ) : (
            !user && (
              <a
                href={`/sign-in?next=${encodeURIComponent(here)}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline"
              >
                Sign in to join
              </a>
            )
          )}
        </Card>
      )}
    </div>
  );
}
