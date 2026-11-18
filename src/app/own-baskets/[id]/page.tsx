import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, CopyLinkButton } from "@/components/client";
import { Alert, Badge, Button, Card, Field, Select } from "@/components/ui";
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
import { itemsLabel, OWN_STATUS, SizeQuantities, TokensField } from "../own-bits";

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
  const here = `/own-baskets/${b.id}${code ? `?code=${encodeURIComponent(code)}` : ""}`;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback={b.isOwner ? "/own-baskets" : `/products/${b.product.id}`} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{b.product.title}</h1>
          <Badge
            tone={b.status === "CANCELLED" ? "bad" : b.status === "DELIVERED" ? "good" : "info"}
          >
            {OWN_STATUS[b.status] ?? b.status}
          </Badge>
        </div>
        <p className="text-sm text-subtle">
          {b.owner} · {b.area} · {itemsLabel(b.items)}
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      {b.isOwner && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm break-words">
            {b.address} · {b.phone}
          </p>
          {b.status === "OPEN" && (
            <>
              {b.shareCode && (
                <CopyLinkButton
                  url={appUrl(`/own-baskets/${b.id}?code=${b.shareCode}`)}
                  label="Copy basket link"
                  className="self-start"
                />
              )}
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
              <form action={closeOwnBasketAction} className="flex flex-wrap items-center gap-3">
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
                    {b.minItems - b.items} more {b.minItems - b.items === 1 ? "item" : "items"}{" "}
                    needed · {b.items} of {b.minItems}
                  </span>
                )}
              </form>
            </>
          )}
          {b.status === "WITH_COURIER" && (
            <form action={confirmDeliveryAction}>
              <input type="hidden" name="basketId" value={b.id} />
              <Button type="submit">Received</Button>
            </form>
          )}
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
                <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{o.mine ? "You" : o.buyer}</span>
                  <span className="text-sm">
                    {o.lines
                      .map((l) => `${[l.size, l.colour].filter(Boolean).join(" · ")} × ${l.qty}`)
                      .join(", ")}
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
              <input type="hidden" name="basketId" value={b.id} />
              {code && <input type="hidden" name="code" value={code} />}
              <input type="hidden" name="requestKey" value={randomUUID()} />
              <SizeQuantities price={b.product.price} variants={b.product.variants} />
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
