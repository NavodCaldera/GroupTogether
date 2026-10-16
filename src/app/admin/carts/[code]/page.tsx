import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/cart-bits";
import { Alert, Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { CANCELLABLE } from "@/lib/cart-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import {
  adminCancelAction,
  bookDeliveryAction,
  deliveryStatusAction,
} from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Cart" };

export default async function AdminCartPage({
  params,
  searchParams,
}: PageProps<"/admin/carts/[code]">) {
  await requireAdmin();
  const [{ code }, { approved, booked }] = await Promise.all([params, searchParams]);
  const cart = await db.groupCart.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      owner: { select: { name: true, phone: true, email: true } },
      members: { include: { user: { select: { name: true, phone: true } } } },
      lines: {
        include: { variant: { include: { product: { select: { title: true, brand: true } } } } },
        orderBy: { variant: { product: { title: "asc" } } },
      },
      slips: { orderBy: { createdAt: "desc" } },
      delivery: true,
    },
  });
  if (!cart) notFound();
  const items = cart.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Cart ${cart.code}`}
          description={`${cart.name ? `${cart.name} · ` : ""}Owner ${cart.owner.name} · ${cart.owner.phone ?? ""} · ${cart.owner.email}`}
          actions={<StatusBadge status={cart.status} />}
        />
        {booked ? (
          <Alert tone="good">Delivery booked. The owner has been told to pay the driver.</Alert>
        ) : (
          approved && (
            <Alert tone="good">
              Slip approved. The order is confirmed; book the PickMe delivery.
            </Alert>
          )
        )}
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
                  <td className="py-1.5 text-right">× {l.qty}</td>
                  <td className="py-1.5 text-right text-subtle">
                    {cart.members.find((m) => m.userId === l.userId)?.user.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">Timeline</h2>
          <p>
            Created {formatDateTime(cart.createdAt)} · expires {formatDateTime(cart.expiresAt)}
          </p>
          {cart.readyAt && <p>Reached minimum {formatDateTime(cart.readyAt)}</p>}
          {cart.acceptedAt && (
            <p>
              Accepted {formatDateTime(cart.acceptedAt)} · slip due {formatDateTime(cart.slipDueAt)}
            </p>
          )}
          {cart.confirmedAt && <p>Confirmed {formatDateTime(cart.confirmedAt)}</p>}
          {cart.closedReason && <p className="text-danger">{cart.closedReason}</p>}
          {cart.slips.map((s) => (
            <p key={s.id}>
              Slip {formatDateTime(s.createdAt)}: <Badge>{s.status}</Badge>{" "}
              <a
                href={`/api/slips/${s.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline"
              >
                open
              </a>
              {s.reviewNote && ` (${s.reviewNote})`}
            </p>
          ))}
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
            </p>
          ) : (
            <p className="text-subtle">Set when the owner accepts.</p>
          )}
          <p className="mt-2 text-xs text-subtle">
            The owner pays the driver. We never collect the fee.
          </p>
        </Card>

        {cart.status === "CONFIRMED" && !cart.delivery && (
          <Card>
            <h2 className="mb-2 font-semibold">Book delivery</h2>
            <AdminForm action={bookDeliveryAction} submit="Mark as booked with PickMe">
              <input type="hidden" name="cartId" value={cart.id} />
              <p className="text-xs text-subtle">
                Manual mode: book the trip in the PickMe business app, then enter what it shows.
                With PickMe API keys set, booking happens automatically.
              </p>
              <Field label="PickMe booking ref" name="externalRef">
                <Input name="externalRef" />
              </Field>
              <Field label="Quoted fee (LKR, shown to the owner)" name="quotedFee">
                <Input name="quotedFee" inputMode="decimal" />
              </Field>
              <Field label="Tracking link" name="trackingUrl">
                <Input name="trackingUrl" type="url" />
              </Field>
              <Field label="Driver name" name="driverName">
                <Input name="driverName" />
              </Field>
              <Field label="Driver phone" name="driverPhone">
                <Input name="driverPhone" />
              </Field>
            </AdminForm>
          </Card>
        )}

        {cart.delivery && (
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Delivery · {cart.delivery.status}</h2>
            <p>
              {cart.delivery.provider}{" "}
              {cart.delivery.externalRef && `· ${cart.delivery.externalRef}`}
            </p>
            {cart.delivery.quotedFee && (
              <p>Fee {formatLKR(cart.delivery.quotedFee)} (owner pays driver)</p>
            )}
            {cart.delivery.driverName && (
              <p>
                {cart.delivery.driverName} · {cart.delivery.driverPhone}
              </p>
            )}
            {cart.delivery.status !== "DELIVERED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(["PICKED_UP", "DELIVERED", "FAILED"] as const).map((s) => (
                  <form key={s} action={deliveryStatusAction}>
                    <input type="hidden" name="deliveryId" value={cart.delivery!.id} />
                    <input type="hidden" name="status" value={s} />
                    <Button variant="secondary" className="min-h-8 text-xs">
                      {s.replace("_", " ").toLowerCase()}
                    </Button>
                  </form>
                ))}
              </div>
            )}
          </Card>
        )}

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
  );
}
