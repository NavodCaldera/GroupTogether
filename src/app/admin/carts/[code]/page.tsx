import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { StatusBadge } from "@/components/cart-bits";
import { Toast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { CANCELLABLE, cartTotal } from "@/lib/cart-rules";
import { mapsLink } from "@/lib/location";
import { formatDateTime, formatLKR } from "@/lib/format";
import {
  adminCancelAction,
  bookDeliveryAction,
  deliveryStatusAction,
} from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { sweep } from "@/server/carts/service";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Cart" };

export default async function AdminCartPage({
  params,
  searchParams,
}: PageProps<"/admin/carts/[code]">) {
  await requireAdmin();
  await sweep();
  const [{ code }, { booked }] = await Promise.all([params, searchParams]);
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
    },
  });
  if (!cart) notFound();
  const items = cart.lines.reduce((n, l) => n + l.qty, 0);
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
          <PageHeader
            title={`Cart ${cart.code}`}
            description={
              <>
                {cart.name && `${cart.name} · `}Owner{" "}
                <Link href={`/admin/users/${cart.ownerId}`} className="text-accent underline">
                  {cart.owner.name}
                </Link>{" "}
                · {cart.owner.phone ?? ""} · {cart.owner.email}
              </>
            }
            actions={<StatusBadge status={cart.status} />}
          />
          {/* After booking the drop: a pop-up, not a banner. */}
          {booked && (
            <Toast ms={5000}>Delivery booked. The owner has been told to pay the driver.</Toast>
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
            <p className="mt-2 text-xs text-subtle">
              Only the owner pays us. Members settle their share with the owner directly.
            </p>
          </Card>
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Timeline</h2>
            <p className="mb-1 text-subtle">
              {cart.visibility === "PRIVATE" ? "Private" : "Public"} · minimum{" "}
              {formatLKR(cart.minOrderValue)} (fixed when the cart started) ·{" "}
              <a href={`/c/${cart.code}`} className="text-accent underline">
                open the shopper view
              </a>
            </p>
            <p>
              Created {formatDateTime(cart.createdAt)} · expires {formatDateTime(cart.expiresAt)}
            </p>
            {cart.readyAt && <p>Reached minimum {formatDateTime(cart.readyAt)}</p>}
            {cart.acceptedAt && (
              <p>
                Accepted {formatDateTime(cart.acceptedAt)} · slip due{" "}
                {formatDateTime(cart.slipDueAt)}
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
                      <Button variant="secondary" className="text-xs sm:min-h-8">
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
    </>
  );
}
