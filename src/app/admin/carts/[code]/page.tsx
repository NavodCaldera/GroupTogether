import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink } from "@/components/client";
import { StatusBadge } from "@/components/cart-bits";
import { Badge, Card, Input, PageHeader, cx } from "@/components/ui";
import { ADMIN_STAGES, CANCELLABLE, adminStage, cartTotal } from "@/lib/cart-rules";
import { mapsLink } from "@/lib/location";
import { formatDateTime, formatLKR } from "@/lib/format";
import { adminCancelAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { packingSelect } from "@/server/packing";
import { AdminForm } from "../../admin-form";
import { NextStep } from "../next-step";

export const metadata: Metadata = { title: "Cart" };

/** The stepper on top: Filling, Paying, Delivering, Done. */
const STEPS = ADMIN_STAGES.slice(1, 5);

export default async function AdminCartPage({ params }: PageProps<"/admin/carts/[code]">) {
  await requireAdmin("WAREHOUSE");
  await sweep();
  const { code } = await params;
  const cart = await db.groupCart.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      owner: { select: { name: true, phone: true, email: true } },
      members: {
        include: { user: { select: { name: true, phone: true, email: true, locked: true } } },
        orderBy: { joinedAt: "asc" },
      },
      lines: {
        include: { variant: { include: { product: { select: { title: true, brand: true } } } } },
        orderBy: { variant: { product: { title: "asc" } } },
      },
      slips: { orderBy: { createdAt: "desc" } },
      delivery: true,
      packing: { select: packingSelect },
    },
  });
  if (!cart) notFound();
  const items = cart.lines.reduce((n, l) => n + l.qty, 0);
  const now = new Date();
  const stage = adminStage(cart.status);
  const closed = stage === "closed";
  const step = STEPS.findIndex((st) => st.key === stage);
  // What happened, oldest first.
  const events: { at: Date; text: ReactNode; bad?: boolean }[] = [
    { at: cart.createdAt, text: `Started by ${cart.owner.name}` },
    ...(cart.readyAt ? [{ at: cart.readyAt, text: "Reached the minimum" }] : []),
    ...(cart.acceptedAt
      ? [{ at: cart.acceptedAt, text: "Owner accepted and froze the cart" }]
      : []),
    ...cart.slips.flatMap((s) => [
      {
        at: s.createdAt,
        text: (
          <>
            Slip uploaded ({formatLKR(s.amount)}) ·{" "}
            <a
              href={`/api/slips/${s.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              open
            </a>
          </>
        ),
      },
      ...(s.reviewedAt
        ? [
            {
              at: s.reviewedAt,
              text:
                s.status === "APPROVED"
                  ? "Slip approved"
                  : `Slip rejected${s.reviewNote ? `: ${s.reviewNote}` : ""}`,
              bad: s.status === "REJECTED",
            },
          ]
        : []),
    ]),
    ...(cart.confirmedAt ? [{ at: cart.confirmedAt, text: "Order confirmed" }] : []),
    ...(cart.delivery
      ? [
          {
            at: cart.delivery.createdAt,
            text: ["PickMe booked", cart.delivery.externalRef, cart.delivery.driverName]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []),
    ...(cart.delivery && ["FAILED", "CANCELLED"].includes(cart.delivery.status)
      ? [{ at: cart.delivery.updatedAt, text: "Delivery failed", bad: true }]
      : []),
    // Packing staff (rule 17): the two people who certified it, and who handed it over.
    ...(cart.packing
      ? [
          {
            at: cart.packing.gatheredAt,
            text: `Checked and gathered by ${cart.packing.gatheredBy.name}`,
          },
          ...(cart.packing.packedAt && cart.packing.packedBy
            ? [
                {
                  at: cart.packing.packedAt,
                  text: `Rechecked and packed by ${cart.packing.packedBy.name}`,
                },
              ]
            : []),
          ...(cart.packing.handedOverAt
            ? [
                {
                  at: cart.packing.handedOverAt,
                  text: `Handed to PickMe by ${cart.packing.handedOverBy?.name}`,
                },
              ]
            : []),
        ]
      : []),
    ...(cart.status === "DELIVERED" && cart.delivery
      ? [{ at: cart.delivery.updatedAt, text: "Delivered" }]
      : []),
    ...(closed
      ? [
          {
            at: cart.updatedAt,
            text: `${cart.status === "EXPIRED" ? "Expired" : "Cancelled"}${cart.closedReason ? `: ${cart.closedReason}` : ""}`,
            bad: true,
          },
        ]
      : []),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  // The deadline still ahead, shown as a hollow dot after the events.
  const upcoming =
    cart.status === "AWAITING_SLIP" && cart.slipDueAt
      ? { at: cart.slipDueAt, text: "Slip due" }
      : cart.status === "OPEN" || cart.status === "READY"
        ? { at: cart.expiresAt, text: "Expires unless the owner accepts" }
        : null;
  // What each member owes the owner (members settle with the owner outside the platform).
  const shares = cart.members.map((m) => {
    const lines = cart.lines.filter((l) => l.userId === m.userId);
    return { ...m, items: lines.reduce((n, l) => n + l.qty, 0), total: cartTotal(lines) };
  });

  return (
    <>
      <BackLink fallback="/admin/carts" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PageHeader title={`Cart ${cart.code}`} actions={<StatusBadge status={cart.status} />} />
          <Card className="flex flex-col gap-3">
            {closed ? (
              <p className="text-sm font-medium text-danger">
                {cart.status === "EXPIRED" ? "Expired" : "Cancelled"}
                {cart.closedReason && `: ${cart.closedReason}`}
              </p>
            ) : (
              <>
                <ol className="grid grid-cols-4 gap-1.5 text-xs" aria-label="Stages">
                  {STEPS.map((st, i) => (
                    <li key={st.key} aria-current={i === step ? "step" : undefined}>
                      <span
                        className={cx(
                          "block h-1.5 rounded-full",
                          i <= step ? "bg-accent" : "bg-muted",
                        )}
                      />
                      <span
                        className={cx("mt-1 block", i === step ? "font-semibold" : "text-subtle")}
                      >
                        {st.label}
                      </span>
                    </li>
                  ))}
                </ol>
                <NextStep cart={cart} now={now} />
              </>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">
              Picking list: {items} items · {formatLKR(cart.total)}
            </h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {cart.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5">
                      {l.variant.product.brand} {l.variant.product.title}
                      <span className="text-subtle">
                        {" "}
                        · {l.variant.size}
                        {l.variant.colour && ` · ${l.variant.colour}`}
                      </span>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">× {l.qty}</td>
                    <td className="py-1.5 text-right text-subtle">
                      {cart.members.find((m) => m.userId === l.userId)?.user.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Members and their shares</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {shares.map((m) => (
                  <tr key={m.id}>
                    <td className="py-1.5">
                      <Link href={`/admin/users/${m.userId}`} className="hover:underline">
                        {m.user.name}
                      </Link>
                      {m.userId === cart.ownerId && (
                        <span className="ml-2">
                          <Badge tone="info">Owner</Badge>
                        </span>
                      )}
                      {m.user.locked && (
                        <span className="ml-2">
                          <Badge tone="bad">Locked</Badge>
                        </span>
                      )}
                      <span className="block text-xs text-subtle">
                        {m.user.phone ?? m.user.email}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-subtle">
                      {m.items} {m.items === 1 ? "item" : "items"}
                    </td>
                    <td className="py-1.5 text-right">{formatLKR(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Timeline</h2>
            <p className="mb-1 text-subtle">
              {cart.visibility === "PRIVATE" ? "Private" : "Public"} · minimum{" "}
              {formatLKR(cart.minOrderValue)} ·{" "}
              <a href={`/c/${cart.code}`} className="text-accent underline">
                open the shopper view
              </a>
            </p>
            <ol className="mt-3 ml-1 flex flex-col gap-2.5 border-l border-line pl-4">
              {[...events, ...(upcoming ? [{ ...upcoming, bad: false, next: true }] : [])].map(
                (e, i) => (
                  <li key={i} className={cx("relative", "next" in e && "text-subtle")}>
                    <span
                      aria-hidden
                      className={cx(
                        "absolute top-1 -left-[21px] size-2.5 rounded-full",
                        "next" in e
                          ? "border border-line bg-paper"
                          : e.bad
                            ? "bg-danger"
                            : "bg-accent",
                      )}
                    />
                    <span className="block text-xs text-subtle">{formatDateTime(e.at)}</span>
                    <span className={cx(e.bad && "text-danger")}>{e.text}</span>
                  </li>
                ),
              )}
            </ol>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">PickMe drop-off</h2>
            {cart.deliveryAddress ? (
              <p>
                {cart.owner.name} · {cart.deliveryPhone}
                <br />
                {cart.deliveryAddress}, {cart.deliveryCity}
                {cart.deliveryLat != null && cart.deliveryLng != null && (
                  <>
                    <br />
                    <a
                      href={mapsLink(cart.deliveryLat, cart.deliveryLng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      Open pinned location
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="text-subtle">Not set yet</p>
            )}
            {cart.delivery?.quotedFee && (
              <p className="mt-2 text-xs text-subtle">
                PickMe fee {formatLKR(cart.delivery.quotedFee)}
              </p>
            )}
          </Card>

          {CANCELLABLE.includes(cart.status) && (
            <Card>
              <AdminForm
                action={adminCancelAction}
                submit="Cancel cart and release stock"
                variant="danger"
              >
                <input type="hidden" name="cartId" value={cart.id} />
                <Input name="reason" placeholder="Reason (shown to members)" />
              </AdminForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
