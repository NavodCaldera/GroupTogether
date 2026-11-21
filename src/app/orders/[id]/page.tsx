import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { ProductImage } from "@/components/cart-bits";
import { BackLink } from "@/components/client";
import { ProductRatingForm } from "@/components/product-rating-form";
import { ReturnForm } from "@/components/return-form";
import { Alert, Badge, Button, Card, LinkButton } from "@/components/ui";
import { FitFeedbackForm } from "@/components/fit/fit-feedback-form";
import { formatHours, mapLink } from "@/lib/agent-hours";
import { openNow } from "@/lib/agent-rules";
import { D, toD } from "@/lib/decimal";
import { kindRegions } from "@/lib/fit/data";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { STAGE_LABEL, orderStage } from "@/lib/order-stage";
import { BUYER_FAULT_KEPT, returnStatusLabel } from "@/lib/return-rules";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { linesAwaitingFit } from "@/server/fit";
import { fitFeedbackAction } from "@/server/fit-actions";
import { buyerOrder, lineState } from "@/server/orders/buyer";
import { basketPayments, joinRequests, type BasketBuyer } from "@/server/orders/own-baskets";
import { buyerReturns } from "@/server/returns";
import {
  answerJoinAction,
  closeOwnBasketAction,
  confirmDeliveryAction,
} from "@/app/own-baskets/actions";
import { LineBadge, factoryName } from "../order-bits";
import { OrderSteps, fillOf, nextOf, productsOf } from "../order-card";
import { fileReturnAction, rateAction } from "./actions";
import { sizeOf } from "@/lib/variant-options";

export const metadata: Metadata = { title: "Order" };

/** Units already in a return that is not in returnedQty: open factory-fault returns and every
 * kept buyer-fault return (DEC-017). */
const OPEN_FACTORY = ["WAITING_FACTORY", "WITH_ADMIN", "ACCEPTED", "AWAITING_HANDOVER"];

/**
 * One order (owner, 2026-11-21, DEC-026). The stage is the heading; the tracker card holds the
 * dates and what can be done now; then where it goes; then for an own basket everyone in it with
 * what they bought and paid, or for an agent order its items and payment. No cancelling.
 */
export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser([...BUYER_ROLES], `/orders/${id}`);
  const found = await buyerOrder(user.id, id);
  if (!found) notFound();
  const { order, canReturn, returnUntil, lockAt, own, ownMinItems, pickup } = found;
  const basket = order.basket;
  const isOwn = basket?.kind === "OWN";
  const [returns, fitLines, payments, requests] = await Promise.all([
    buyerReturns(user.id, order.id),
    linesAwaitingFit(user.id, { orderId: order.id }),
    isOwn && basket ? basketPayments(basket.id, user.id) : null,
    isOwn && basket ? joinRequests(user.id, basket.id) : [],
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

  const { first, more } = productsOf(order);
  const stage = orderStage(order);
  const track = stage && stage !== "refunded" ? stage : null;
  const next = nextOf(order, stage, own, ownMinItems, lockAt);
  const dates = [
    formatDate(order.paidAt),
    basket?.lockedAt ? formatDate(basket.lockedAt) : null,
    basket?.courier?.givenToDriverAt ? formatDate(basket.courier.givenToDriverAt) : null,
    isOwn
      ? basket?.deliveredAt && formatDate(basket.deliveredAt)
      : order.receivedAt && formatDate(order.receivedAt),
  ];
  const isOwner = isOwn && basket?.ownerId === user.id;
  const canPlace = isOwner && basket?.status === "OPEN";
  const short = canPlace && (own.get(basket!.id)?.items ?? 0) < ownMinItems;
  const here = `/orders/${order.id}`;
  const buyers = payments?.buyers ?? [];
  const agentOpen = order.agent ? openNow(order.agent.hours, new Date()) : false;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback="/orders" />
        <h1 className="text-2xl font-semibold tracking-tight">
          {stage ? STAGE_LABEL[stage] : "Not paid"}
        </h1>
        <p className="text-sm text-subtle">
          {first?.variant.product.title ?? "Order"}
          {more > 0 && ` +${more} more`} · {factoryName(order.factory)}
        </p>
      </div>
      {error && <Alert>{error}</Alert>}

      <Card className="flex flex-col gap-4">
        {track ? (
          <OrderSteps
            stage={track}
            fill={fillOf(order, stage, own, ownMinItems, lockAt)}
            dates={dates}
          />
        ) : (
          <p className="text-sm text-subtle tabular-nums">{formatDateTime(order.createdAt)}</p>
        )}
        {(next || canPlace) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {next && (
              <p id="order-next" className="text-sm text-subtle tabular-nums">
                {next}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {canPlace && (
                <form action={closeOwnBasketAction}>
                  <input type="hidden" name="basketId" value={basket!.id} />
                  <input type="hidden" name="back" value={here} />
                  <Button
                    type="submit"
                    disabled={short}
                    aria-describedby={short && next ? "order-next" : undefined}
                  >
                    Place order
                  </Button>
                </form>
              )}
            </div>
          </div>
        )}
        {isOwner && basket?.status === "WITH_COURIER" && (
          <form action={confirmDeliveryAction}>
            <input type="hidden" name="basketId" value={basket.id} />
            <input type="hidden" name="back" value={here} />
            <Button type="submit" className="w-full sm:w-auto">
              Received
            </Button>
          </form>
        )}
        {pickup && (
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
            <p
              className="font-mono text-4xl font-bold tracking-[0.2em] tabular-nums"
              aria-label={`Pickup code ${pickup.code.split("").join(" ")}`}
            >
              {pickup.code}
            </p>
            <p className="text-sm tabular-nums">
              {pickup.pieces} item{pickup.pieces === 1 ? "" : "s"}
              {pickup.fee.gt(0) && <> · {formatLKR(pickup.fee)} cash</>}
            </p>
          </div>
        )}
      </Card>

      {order.agent ? (
        <Card className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{order.agent.user.name}</h2>
            {order.agent.hours.length > 0 && (
              <Badge tone={agentOpen ? "good" : "neutral"}>
                {agentOpen ? "Open now" : "Closed"}
              </Badge>
            )}
          </div>
          <p className="text-sm">
            {[order.agent.address, order.agent.city].filter(Boolean).join(", ")}
          </p>
          {order.agent.hours.length > 0 && (
            <p className="text-sm text-subtle">{formatHours(order.agent.hours)}</p>
          )}
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
            <h2 className="font-semibold">{basket.deliveryArea || "Delivery"}</h2>
            {basket.deliveryAddress && (
              <p className="text-sm break-words">
                {[basket.deliveryAddress, basket.deliveryPhone].filter(Boolean).join(" · ")}
              </p>
            )}
          </Card>
        )
      )}

      {requests.length > 0 && (
        <section aria-labelledby="order-requests" className="flex flex-col gap-2">
          <h2 id="order-requests" className="text-lg font-semibold">
            Requests · {requests.length}
          </h2>
          <Card>
            <ul className="flex flex-col divide-y divide-line">
              {requests.map((q) => (
                <li key={q.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{q.name}</span>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {q.lines.map((l, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-muted px-2 py-0.5 text-sm tabular-nums"
                        >
                          {[l.title, l.label].filter(Boolean).join(" · ")} × {l.qty}
                        </span>
                      ))}
                    </span>
                  </div>
                  <form action={answerJoinAction} className="flex gap-2">
                    <input type="hidden" name="requestId" value={q.id} />
                    <input type="hidden" name="back" value={here} />
                    <Button
                      type="submit"
                      name="answer"
                      value="accept"
                      aria-label={`Accept ${q.name}`}
                    >
                      Accept
                    </Button>
                    <Button
                      type="submit"
                      name="answer"
                      value="decline"
                      variant="secondary"
                      aria-label={`Decline ${q.name}`}
                    >
                      Decline
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {isOwn && buyers.length > 0 ? (
        <section aria-labelledby="order-buyers" className="flex flex-col gap-2">
          <h2 id="order-buyers" className="text-lg font-semibold">
            Buyers
          </h2>
          <Card className="flex flex-col divide-y divide-line">
            {buyers.map((b) => (
              <BuyerBlock key={b.id} buyer={b} />
            ))}
            {payments?.totals && (
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 pt-4 text-sm tabular-nums [&>dd]:pl-4 [&>dd]:text-right">
                <dt className="font-semibold">Basket</dt>
                <dd className="text-subtle">
                  {payments.totals.items} item{payments.totals.items === 1 ? "" : "s"}
                </dd>
                <dt>Items</dt>
                <dd>{formatLKR(payments.totals.itemsAmount)}</dd>
                {payments.totals.payhereFees.gt(0) && (
                  <>
                    <dt>PayHere fees</dt>
                    <dd>{formatLKR(payments.totals.payhereFees)}</dd>
                  </>
                )}
                <dt className="border-t border-line pt-2 text-base font-semibold">Total</dt>
                <dd className="border-t border-line pt-2 text-base font-semibold">
                  {formatLKR(payments.totals.total)}
                </dd>
                {stage !== "delivered" && (
                  <>
                    <dt className="text-subtle">Courier fee</dt>
                    <dd className="text-subtle">On delivery</dd>
                  </>
                )}
              </dl>
            )}
          </Card>
        </section>
      ) : (
        <>
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
                              className="inline-flex min-h-11 min-w-0 items-start font-medium underline-offset-2 hover:underline sm:min-h-0"
                            >
                              {l.variant.product.title}
                            </Link>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">
                              {formatLKR(toD(l.unitPrice).times(l.qty))}
                            </span>
                          </div>
                          <p className="text-sm text-subtle tabular-nums">
                            {l.variantLabel && <>{l.variantLabel} · </>}
                            {l.qty} × {formatLKR(l.unitPrice)}
                          </p>
                          {l.missingQty > 0 && (
                            <p className="text-sm text-danger">Missing {l.missingQty}</p>
                          )}
                          {l.returnedQty > 0 && <p className="text-sm">Returned {l.returnedQty}</p>}
                          {state === "Cancelled" && (
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

          <section aria-labelledby="order-payment" className="flex flex-col gap-2">
            <h2 id="order-payment" className="text-lg font-semibold">
              Payment
            </h2>
            <Card>
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums [&>dd]:pl-4 [&>dd]:text-right">
                <dt>Items</dt>
                <dd>{formatLKR(order.itemsTotal)}</dd>
                {toD(order.courierTotal).gt(0) && (
                  <>
                    <dt>Courier</dt>
                    <dd>{formatLKR(order.courierTotal)}</dd>
                  </>
                )}
                {toD(order.agentFeeTotal).gt(0) && (
                  <>
                    <dt>Agent fee</dt>
                    <dd>{formatLKR(order.agentFeeTotal)}</dd>
                  </>
                )}
                {toD(order.tokensApplied).gt(0) && (
                  <>
                    <dt>Tokens</dt>
                    <dd>{formatLKR(toD(order.tokensApplied).neg())}</dd>
                  </>
                )}
                {toD(order.gatewayFee).gt(0) && (
                  <>
                    <dt>PayHere fee</dt>
                    <dd>{formatLKR(order.gatewayFee)}</dd>
                  </>
                )}
                <dt className="border-t border-line pt-2 text-base font-semibold">
                  {order.paidAt ? "Paid" : "To pay"}
                </dt>
                <dd className="border-t border-line pt-2 text-base font-semibold">
                  {formatLKR(order.amountDue)}
                </dd>
                {feeDue.gt(0) && !pickup && (
                  <>
                    <dt className="text-subtle">Agent and courier fee at pickup</dt>
                    <dd className="text-subtle">{formatLKR(feeDue)}</dd>
                  </>
                )}
                {feePaid.gt(0) && (
                  <>
                    <dt className="text-subtle">Agent fee paid</dt>
                    <dd className="text-subtle">{formatLKR(feePaid)}</dd>
                  </>
                )}
              </dl>
            </Card>
          </section>
        </>
      )}

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
                size={sizeOf(l.variant.options) || l.variantLabel}
                regions={kindRegions(l.variant.product.kind)}
                action={fitFeedbackAction}
              />
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

/** One buyer in an own basket: sizes bought and, when the viewer may see it, the money. */
function BuyerBlock({ buyer: b }: { buyer: BasketBuyer }) {
  return (
    <div className="flex flex-col gap-2 py-4 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <span className="truncate">{b.you ? "You" : b.name}</span>
          {b.owner && !b.you && <Badge>Owner</Badge>}
        </span>
        {!b.paid && (
          <span className="shrink-0 text-sm text-subtle tabular-nums">
            {b.items} item{b.items === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm tabular-nums [&>dd]:pl-4 [&>dd]:text-right">
        {b.lines.map((l, i) => (
          <Fragment key={i}>
            <dt className="text-subtle">
              {l.label} × {l.qty}
            </dt>
            <dd>{l.amount ? formatLKR(l.amount) : ""}</dd>
          </Fragment>
        ))}
        {b.payhereFee?.gt(0) && (
          <>
            <dt className="text-subtle">PayHere fee</dt>
            <dd>{formatLKR(b.payhereFee)}</dd>
          </>
        )}
        {b.paid && (
          <>
            <dt className="font-medium">Paid</dt>
            <dd className="font-medium">{formatLKR(b.paid)}</dd>
          </>
        )}
        {b.tokens?.gt(0) && (
          <>
            <dt className="text-subtle">in tokens</dt>
            <dd className="text-subtle">{formatLKR(b.tokens)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
