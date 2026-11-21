import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/cart-bits";
import { BackLink, CopyLinkButton } from "@/components/client";
import { ProductRatingForm } from "@/components/product-rating-form";
import { ReturnForm } from "@/components/return-form";
import { Alert, Badge, Button, Card, Field, LinkButton, Select } from "@/components/ui";
import { mapLink } from "@/lib/agent-hours";
import { D, toD } from "@/lib/decimal";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { buyerOrder, lineState } from "@/server/orders/buyer";
import { buyerReturns } from "@/server/returns";
import { LineBadge, factoryName } from "../order-bits";
import { OrderSteps, fillOf, nextOf } from "../order-card";
import { orderStage } from "@/lib/order-stage";
import { fileReturnAction, rateAction } from "./actions";
import {
  closeOwnBasketAction,
  confirmDeliveryAction,
  setVisibilityAction,
} from "@/app/own-baskets/actions";
import { basketPayments, ownBasketView } from "@/server/orders/own-baskets";
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
const STAGE: Record<string, string> = {
  LOCKED: "Packing",
  PACKED: "Packed",
  WITH_COURIER: "With the courier",
  AWAITING_FEE: "Waiting for delivery fee",
};

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser([...BUYER_ROLES], `/orders/${id}`);
  const found = await buyerOrder(user.id, id);
  if (!found) notFound();
  const { order, canReturn, returnUntil, lockAt, own, ownMinItems } = found;
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
  const stg = orderStage(order);
  const end = stg === "refunded" ? { label: "Refunded", tone: "bad" as const } : null;
  const step =
    stg === "filling" ? 1 : stg === "packing" || stg === "on_the_way" ? 2 : stg ? 3 : null;
  const { next, share } = nextOf(order, stg, own, ownMinItems, lockAt);
  const basket = order.basket;
  const isOwn = basket?.kind === "OWN";
  const ownItems = basket ? own.get(basket.id)?.items : undefined;
  // Collected or delivered orders keep the full tracker so its dates stay visible.
  const track = stg && stg !== "refunded" ? stg : null;
  const dates = [
    formatDate(order.paidAt),
    basket?.lockedAt ? formatDate(basket.lockedAt) : null,
    null,
    isOwn
      ? basket?.deliveredAt && formatDate(basket.deliveredAt)
      : order.receivedAt && formatDate(order.receivedAt),
  ];
  const stage = step === 2 && basket ? (STAGE[basket.status] ?? null) : null;
  // Own baskets are run from here (owner, 2026-11-21): the owner's controls and who else is in it.
  const isOwner = isOwn && basket?.ownerId === user.id;
  const view = isOwner && basket ? await ownBasketView(basket.id, user.id, null) : null;
  // Everyone else in an own basket and what they bought (owner, 2026-11-21).
  const people = ((isOwn && basket ? await basketPayments(basket.id, user.id) : null)?.buyers ?? [])
    .filter((b) => !b.you)
    .map((b) => ({
      id: b.id,
      name: b.name,
      owner: b.owner,
      items: b.items,
      sizes: b.lines.map((l) => ({
        size: [l.size, l.colour].filter(Boolean).join(" · "),
        qty: l.qty,
      })),
    }));
  const canPlace = isOwner && basket?.status === "OPEN";
  const short = canPlace && (ownItems ?? 0) < ownMinItems;
  const here = `/orders/${order.id}`;
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
        <p className="text-sm text-subtle">{factoryName(order.factory)}</p>
      </div>
      {error && <Alert>{error}</Alert>}

      <Card className="flex flex-col gap-4">
        {track !== null ? (
          <OrderSteps
            stage={track}
            fill={fillOf(order, stg, own, ownMinItems, lockAt)}
            dates={dates}
          />
        ) : (
          <p className="text-sm text-subtle">Ordered {formatDateTime(order.createdAt)}</p>
        )}
        {(next || stage || share || canPlace) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {(next || stage) && (
              <p id="order-next" className="text-sm text-subtle tabular-nums">
                {next ?? stage}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {share && <CopyLinkButton url={share} label="Share basket" />}
              {canPlace && basket && (
                <form action={closeOwnBasketAction}>
                  <input type="hidden" name="basketId" value={basket.id} />
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
        {canPlace && basket && (
          <form action={setVisibilityAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="basketId" value={basket.id} />
            <input type="hidden" name="back" value={here} />
            <Field label="Who can join" name="visibility">
              <Select id="visibility" name="visibility" defaultValue={view?.visibility ?? "LINK"}>
                <option value="LINK">People with the link</option>
                <option value="PUBLIC">Anyone</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </form>
        )}
        {isOwner && basket?.status === "WITH_COURIER" && (
          <form action={confirmDeliveryAction}>
            <input type="hidden" name="basketId" value={basket.id} />
            <input type="hidden" name="back" value={here} />
            <Button type="submit">Received</Button>
          </form>
        )}
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
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">Delivery</p>
              <h2 className="font-semibold">
                {[isOwner ? "You" : people.length ? null : basket.owner?.name, basket.deliveryArea]
                  .filter(Boolean)
                  .join(" · ")}
              </h2>
              {basket.deliveryAddress && (
                <p className="text-sm break-words">
                  {[basket.deliveryAddress, basket.deliveryPhone].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {people.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <h3 className="text-xs font-medium tracking-wide text-subtle uppercase">
                  Also in this basket
                </h3>
                <ul className="flex flex-col gap-3">
                  {people.map((p) => (
                    <li key={p.id} className="flex items-start gap-3">
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold"
                        aria-hidden
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 font-medium">
                            <span className="truncate">{p.name}</span>
                            {p.owner && <Badge>Owner</Badge>}
                          </span>
                          <span className="shrink-0 text-sm text-subtle tabular-nums">
                            {p.items} {p.items === 1 ? "item" : "items"}
                          </span>
                        </div>
                        <span className="flex flex-wrap gap-1.5">
                          {p.sizes.map((z) => (
                            <span
                              key={z.size}
                              className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums"
                            >
                              {z.size} × {z.qty}
                            </span>
                          ))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
    </div>
  );
}
