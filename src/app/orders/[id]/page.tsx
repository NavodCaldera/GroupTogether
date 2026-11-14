import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ProductRatingForm } from "@/components/product-rating-form";
import { ReturnForm } from "@/components/return-form";
import { Alert, Badge, Button, Card, LinkButton } from "@/components/ui";
import { mapLink } from "@/lib/agent-hours";
import { toD } from "@/lib/decimal";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrder, lineState } from "@/server/orders/buyer";
import { buyerReturns } from "@/server/returns";
import { BasketProgress, LineBadge, OrderBadge, factoryName } from "../order-bits";
import { cancelOrderAction, fileReturnAction, rateAction } from "./actions";
import { BUYER_FAULT_KEPT, returnStatusLabel } from "@/lib/return-rules";

export const metadata: Metadata = { title: "Order" };

/** Units already in a return that is not in returnedQty: open factory-fault returns and every
 * kept buyer-fault return (DEC-017). */
const OPEN_FACTORY = ["WAITING_FACTORY", "WITH_ADMIN", "ACCEPTED", "AWAITING_HANDOVER"];

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser([...BUYER_ROLES], `/orders/${id}`);
  const found = await buyerOrder(user.id, id);
  if (!found) notFound();
  const { order, canCancel, canReturn, returnUntil, lockAt } = found;
  const returns = await buyerReturns(user.id, order.id);
  const error = typeof sp.error === "string" ? sp.error : null;
  const rated = new Set(order.productRatings.map((r) => r.productId));
  const toRate = [
    ...new Map(
      order.lines
        .filter((l) => l.collectedAt && order.status === "RECEIVED")
        .map((l) => [l.variant.product.id, l.variant.product.title]),
    ),
  ].filter(([productId]) => !rated.has(productId));
  const due = toD(order.amountDue);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback="/orders" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{factoryName(order.factory)}</h1>
          <OrderBadge
            status={order.status}
            collected={order.lines.every((l) => l.collectedAt || l.status !== "ACTIVE")}
          />
        </div>
        <p className="text-sm text-subtle">{formatDateTime(order.createdAt)}</p>
      </div>
      {error && <Alert>{error}</Alert>}

      <Card className="flex flex-col gap-1">
        <h2 className="font-semibold">{order.agent.user.name}</h2>
        <p className="text-sm">
          {[order.agent.address, order.agent.city].filter(Boolean).join(", ")}
        </p>
        <LinkButton
          href={mapLink(order.agent)}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          className="mt-2 self-start"
        >
          Map ↗
        </LinkButton>
      </Card>

      {order.basket && order.status !== "CANCELLED" && (
        <BasketProgress basket={order.basket} lockAt={lockAt} />
      )}

      <section aria-labelledby="order-lines" className="flex flex-col gap-2">
        <h2 id="order-lines" className="text-lg font-semibold">
          Items
        </h2>
        <Card>
          <ul className="flex flex-col divide-y divide-line">
            {order.lines.map((l) => {
              const pending = returns
                .filter(
                  (r) =>
                    r.orderLineId === l.id &&
                    (r.fault === "BUYER"
                      ? BUYER_FAULT_KEPT.includes(r.status)
                      : OPEN_FACTORY.includes(r.status)),
                )
                .reduce((n, r) => n + r.qty, 0);
              const left = l.qty - l.returnedQty - l.missingQty - pending;
              return (
                <li key={l.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{l.variant.product.title}</p>
                      <p className="text-sm text-subtle">
                        {[l.variant.size, l.variant.colour].filter(Boolean).join(" · ")} × {l.qty} ·{" "}
                        {formatLKR(l.unitPrice)}
                      </p>
                      {l.missingQty > 0 && (
                        <p className="text-sm text-danger">Missing {l.missingQty}</p>
                      )}
                      {l.returnedQty > 0 && <p className="text-sm">Returned {l.returnedQty}</p>}
                    </div>
                    <LineBadge state={lineState(order, l)} />
                  </div>
                  {canReturn && l.collectedAt && left > 0 && (
                    <details className="rounded-lg border border-line p-3">
                      <summary className="flex min-h-11 cursor-pointer items-center font-medium sm:min-h-10">
                        File return
                      </summary>
                      <ReturnForm
                        id={l.id}
                        op="file"
                        maxQty={left}
                        buyerShare={l.factoryPrice.toString()}
                        action={fileReturnAction}
                      />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        {canReturn && returnUntil && (
          <p className="text-sm text-warn">Returns until {formatDateTime(returnUntil)}</p>
        )}
      </section>

      {returns.length > 0 && (
        <section aria-labelledby="order-returns" className="flex flex-col gap-2">
          <h2 id="order-returns" className="text-lg font-semibold">
            Returns
          </h2>
          {returns.map((r) => (
            <Card key={r.id} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {r.orderLine?.variant.product.title} × {r.qty}
                </p>
                <Badge tone={r.status === "REJECTED" || r.status === "LAPSED" ? "bad" : "info"}>
                  {returnStatusLabel(r.status, r.fault)}
                </Badge>
              </div>
              {r.status === "AWAITING_HANDOVER" && r.handoverAgent && (
                <p className="text-sm">
                  {r.handoverAgent.user.name} ·{" "}
                  <span className="text-warn">Due {formatDate(r.handoverDueAt)}</span>
                </p>
              )}
            </Card>
          ))}
        </section>
      )}

      {toRate.length > 0 && (
        <section aria-labelledby="order-rate" className="flex flex-col gap-2">
          <h2 id="order-rate" className="text-lg font-semibold">
            Rate
          </h2>
          <Card className="flex flex-col gap-3">
            {toRate.map(([productId, title]) => (
              <ProductRatingForm
                key={productId}
                orderId={order.id}
                productId={productId}
                title={title}
                rateAction={rateAction}
              />
            ))}
          </Card>
        </section>
      )}

      <Card>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
          <dt>Item</dt>
          <dd className="text-right">{formatLKR(order.itemsTotal)}</dd>
          {toD(order.courierTotal).gt(0) && (
            <>
              <dt>Courier</dt>
              <dd className="text-right">{formatLKR(order.courierTotal)}</dd>
            </>
          )}
          <dt>Agent fee</dt>
          <dd className="text-right">{formatLKR(order.agentFeeTotal)}</dd>
          <dt>Tokens</dt>
          <dd className="text-right">{formatLKR(toD(order.tokensApplied).neg())}</dd>
          <dt>PayHere fee</dt>
          <dd className="text-right">{formatLKR(order.gatewayFee)}</dd>
          <dt className="border-t border-line pt-2 text-base font-semibold">Total</dt>
          <dd className="border-t border-line pt-2 text-right text-base font-semibold">
            {formatLKR(due)}
          </dd>
        </dl>
      </Card>

      {canCancel && (
        <details className="rounded-xl border border-line p-4">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium sm:min-h-10">
            Cancel order
          </summary>
          <form action={cancelOrderAction} className="mt-2">
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" variant="danger">
              Confirm cancel
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
