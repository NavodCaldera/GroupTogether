import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ProductImage } from "@/components/cart-bits";
import { BackLink, CopyLinkButton } from "@/components/client";
import { ProductRatingForm } from "@/components/product-rating-form";
import { ReturnForm } from "@/components/return-form";
import { FillBar } from "@/components/step-track";
import { Alert, Badge, Button, Card, LinkButton } from "@/components/ui";
import { mapLink } from "@/lib/agent-hours";
import { D, toD } from "@/lib/decimal";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrder, lineState } from "@/server/orders/buyer";
import { buyerReturns } from "@/server/returns";
import { LineBadge, factoryName } from "../order-bits";
import { OrderSteps, endOf, nextOf, stepOf } from "../order-card";
import { cancelOrderAction, fileReturnAction, rateAction } from "./actions";
import { BUYER_FAULT_KEPT, returnStatusLabel } from "@/lib/return-rules";
import { FitFeedbackForm } from "@/components/fit/fit-feedback-form";
import { kindRegions } from "@/lib/fit/data";
import { linesAwaitingFit } from "@/server/fit";
import { fitFeedbackAction } from "@/server/fit-actions";

export const metadata: Metadata = { title: "Order" };

/** Units already in a return that is not in returnedQty: open factory-fault returns and every
 * kept buyer-fault return (DEC-017). */
const OPEN_FACTORY = ["WAITING_FACTORY", "WITH_ADMIN", "ACCEPTED", "AWAITING_HANDOVER"];

/** A locked basket's stage, said in words under the tracker. */
const STAGE: Record<string, (factory: string) => string> = {
  LOCKED: (f) => `Packing at ${f}`,
  PACKED: (f) => `Packed at ${f}`,
  WITH_COURIER: () => "With the courier",
  AWAITING_FEE: () => "Waiting for delivery fee",
};

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser([...BUYER_ROLES], `/orders/${id}`);
  const found = await buyerOrder(user.id, id);
  if (!found) notFound();
  const { order, canCancel, canReturn, returnUntil, lockAt, own, ownMinItems } = found;
  const [returns, fitLines] = await Promise.all([
    buyerReturns(user.id, order.id),
    linesAwaitingFit(user.id, { orderId: order.id }),
  ]);
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
  // The agent fee is paid in cash at pickup, so it sits outside the online total (DEC-019).
  const live = order.status !== "CANCELLED";
  const feeDue = order.lines.reduce(
    (sum, l) =>
      live && l.status === "ACTIVE" && !l.collectedAt
        ? sum.plus(toD(l.cashFeeEach).times(Math.max(l.qty - l.missingQty, 0)))
        : sum,
    new D(0),
  );
  const feePaid = order.lines.reduce(
    (sum, l) => (l.cashFeePaid === null ? sum : sum.plus(toD(l.cashFeePaid))),
    new D(0),
  );

  const first = order.lines[0];
  const more = order.lines.length - 1;
  const end = endOf(order);
  const step = end ? null : stepOf(order);
  const { next, share } = nextOf(order, step, own, ownMinItems, lockAt);
  const basket = order.basket;
  const isOwn = basket?.kind === "OWN";
  const ownItems = basket ? own.get(basket.id)?.items : undefined;
  // How full a filling basket is: items against the minimum, or value against the lock amount.
  let fill: number | null = null;
  if (step === 1 && basket) {
    if (isOwn) fill = ownItems === undefined ? null : ownItems / Math.max(ownMinItems, 1);
    else fill = lockAt.lte(0) ? 1 : toD(basket.total).div(lockAt).toNumber();
  }
  const stage =
    step === 2 && basket ? (STAGE[basket.status]?.(factoryName(order.factory)) ?? null) : null;
  const timeline = (
    [
      ["Ordered", order.createdAt],
      ["Paid", order.paidAt],
      ["Basket full", basket?.lockedAt],
      [isOwn ? "Delivered" : "Ready", isOwn ? basket?.deliveredAt : order.receivedAt],
    ] as [string, Date | null | undefined][]
  ).filter((t): t is [string, Date] => t[1] instanceof Date);
  const pieces = order.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback="/orders" />
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
            {first?.variant.product.title ?? "Order"}
            {more > 0 && <span className="font-normal text-subtle"> +{more} more</span>}
          </h1>
          {(end || step === null) && (
            <span className="mt-1.5 shrink-0">
              <Badge tone={end?.tone ?? "bad"}>{end?.label ?? "Unpaid"}</Badge>
            </span>
          )}
        </div>
        <p className="text-sm text-subtle">
          {factoryName(order.factory)} · {formatDateTime(order.createdAt)}
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      <Card className="flex flex-col gap-4">
        {step !== null && <OrderSteps order={order} step={step} />}
        {fill !== null && <FillBar value={fill} label="Basket progress" />}
        {(next || stage || share) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {(next || stage) && <p className="text-sm text-subtle tabular-nums">{next ?? stage}</p>}
            {share && <CopyLinkButton url={share} label="Share basket" />}
          </div>
        )}
        <dl
          className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm ${step !== null ? "border-t border-line pt-3" : ""}`}
        >
          {timeline.map(([label, at]) => (
            <Fragment key={label}>
              <dt className="text-subtle">{label}</dt>
              <dd className="text-right tabular-nums">{formatDateTime(at)}</dd>
            </Fragment>
          ))}
        </dl>
      </Card>

      {order.agent ? (
        <Card className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">Pickup</p>
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
      ) : (
        basket && (
          <Card className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-subtle uppercase">Delivery</p>
            <h2 className="font-semibold">
              {[basket.owner?.name, basket.deliveryArea].filter(Boolean).join(" · ") ||
                "Own basket"}
            </h2>
            {basket.deliveryAddress && (
              <p className="text-sm break-words">
                {[basket.deliveryAddress, basket.deliveryPhone].filter(Boolean).join(" · ")}
              </p>
            )}
            <LinkButton
              href={`/own-baskets/${basket.id}`}
              variant="secondary"
              className="mt-2 self-start"
            >
              {basket.ownerId === user.id ? "Manage basket" : "View basket"}
            </LinkButton>
          </Card>
        )
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
              const state = lineState(order, l);
              return (
                <li key={l.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="w-14 shrink-0">
                      <ProductImage {...l.variant.product} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${l.variant.product.id}`}
                          className="min-w-0 font-medium underline-offset-2 hover:underline"
                        >
                          {l.variant.product.title}
                        </Link>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {formatLKR(toD(l.unitPrice).times(l.qty))}
                        </span>
                      </div>
                      <p className="text-sm text-subtle tabular-nums">
                        {[l.variant.size, l.variant.colour].filter(Boolean).join(" · ")} · {l.qty} ×{" "}
                        {formatLKR(l.unitPrice)}
                      </p>
                      {l.missingQty > 0 && (
                        <p className="text-sm text-danger">Missing {l.missingQty}</p>
                      )}
                      {l.returnedQty > 0 && <p className="text-sm">Returned {l.returnedQty}</p>}
                      {(state === "Cancelled" || state === "Collected") && (
                        <span className="mt-1 self-start">
                          <LineBadge state={state} />
                        </span>
                      )}
                    </div>
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

      {fitLines.length > 0 && (
        <section aria-labelledby="order-fit" className="flex flex-col gap-2">
          <h2 id="order-fit" className="text-lg font-semibold">
            How did it fit?
          </h2>
          <Card className="flex flex-col gap-3">
            {fitLines.map((l) => (
              <FitFeedbackForm
                key={l.id}
                lineId={l.id}
                title={l.variant.product.title}
                size={l.variant.size}
                regions={kindRegions(l.variant.product.kind)}
                action={fitFeedbackAction}
              />
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="order-payment" className="flex flex-col gap-2">
        <h2 id="order-payment" className="text-lg font-semibold">
          Payment
        </h2>
        <Card>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums [&>dd]:pl-4">
            <dt>
              {pieces} item{pieces === 1 ? "" : "s"}
            </dt>
            <dd className="text-right">{formatLKR(order.itemsTotal)}</dd>
            {toD(order.courierTotal).gt(0) && (
              <>
                <dt>Courier</dt>
                <dd className="text-right">{formatLKR(order.courierTotal)}</dd>
              </>
            )}
            {toD(order.agentFeeTotal).gt(0) && (
              <>
                <dt>Agent fee</dt>
                <dd className="text-right">{formatLKR(order.agentFeeTotal)}</dd>
              </>
            )}
            {toD(order.tokensApplied).gt(0) && (
              <>
                <dt>Tokens</dt>
                <dd className="text-right">{formatLKR(toD(order.tokensApplied).neg())}</dd>
              </>
            )}
            <dt>PayHere fee</dt>
            <dd className="text-right">{formatLKR(order.gatewayFee)}</dd>
            <dt className="border-t border-line pt-2 text-base font-semibold">
              {order.paidAt ? "Paid" : "To pay"}
            </dt>
            <dd className="border-t border-line pt-2 text-right text-base font-semibold">
              {formatLKR(due)}
            </dd>
            {isOwn && step !== null && step < 3 && (
              <>
                <dt className="text-subtle">Courier fee</dt>
                <dd className="text-right text-subtle">On delivery</dd>
              </>
            )}
            {feeDue.gt(0) && (
              <>
                <dt className="text-subtle">Agent fee at pickup</dt>
                <dd className="text-right text-subtle">{formatLKR(feeDue)}</dd>
              </>
            )}
            {feePaid.gt(0) && (
              <>
                <dt className="text-subtle">Agent fee paid</dt>
                <dd className="text-right text-subtle">{formatLKR(feePaid)}</dd>
              </>
            )}
          </dl>
        </Card>
      </section>

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
