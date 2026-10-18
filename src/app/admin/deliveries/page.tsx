import type { Metadata } from "next";
import Link from "next/link";
import { packingSummary } from "@/components/packing-bits";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { formatDateTime, formatLKR } from "@/lib/format";
import { deliveryStatusAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { packingSelect } from "@/server/packing";
import { Table } from "../list-bits";

export const metadata: Metadata = { title: "Deliveries" };

const STATUS_TONE: Record<DeliveryStatus, "neutral" | "good" | "bad" | "info"> = {
  BOOKED: "info",
  PICKED_UP: "info",
  DELIVERED: "good",
  FAILED: "bad",
  CANCELLED: "neutral",
};
const label = (s: DeliveryStatus) => s.replace("_", " ").toLowerCase();

export default async function DeliveriesPage() {
  await requireAdmin();
  const cartSelect = {
    code: true,
    deliveryAddress: true,
    deliveryCity: true,
    deliveryPhone: true,
    owner: { select: { name: true } },
    packing: { select: packingSelect },
  } as const;
  const [toBook, inFlight, delivered] = await Promise.all([
    db.groupCart.findMany({
      where: { status: "CONFIRMED", delivery: { is: null } },
      select: { ...cartSelect, id: true, confirmedAt: true, lines: { select: { qty: true } } },
      orderBy: { confirmedAt: "asc" },
    }),
    db.delivery.findMany({
      where: { status: { in: ["BOOKED", "PICKED_UP", "FAILED"] } },
      include: { cart: { select: cartSelect } },
      orderBy: { createdAt: "asc" },
    }),
    db.delivery.findMany({
      where: { status: "DELIVERED" },
      include: { cart: { select: cartSelect } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="One PickMe drop per confirmed cart, to the owner. The owner pays the driver; we never collect the fee."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">To book ({toBook.length})</h2>
        {toBook.length === 0 ? (
          <EmptyState title="Nothing waiting to be booked" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {toBook.map((c) => (
              <Card key={c.id} className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className="text-xs text-subtle">
                    Confirmed {formatDateTime(c.confirmedAt)}
                  </span>
                </div>
                <p>
                  {c.owner.name} · {c.deliveryPhone}
                  <br />
                  <span className="text-subtle">
                    {c.deliveryAddress}, {c.deliveryCity}
                  </span>
                </p>
                <p className="text-subtle">{c.lines.reduce((n, l) => n + l.qty, 0)} items</p>
                <p className="text-xs">{packingSummary(c.packing)}</p>
                <Link
                  href={`/admin/carts/${c.code}`}
                  className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-medium text-on-accent hover:opacity-90 sm:min-h-10"
                >
                  Pick and book PickMe
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">On the way ({inFlight.length})</h2>
        {inFlight.length === 0 ? (
          <EmptyState title="No drops in progress" />
        ) : (
          <Table
            head={
              <>
                <th>Cart</th>
                <th>Drop-off</th>
                <th>PickMe</th>
                <th>Status</th>
                <th>Update</th>
              </>
            }
          >
            {inFlight.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link
                    href={`/admin/carts/${d.cart.code}`}
                    className="font-mono text-accent underline"
                  >
                    {d.cart.code}
                  </Link>
                  <span className="block text-xs text-subtle">
                    Booked {formatDateTime(d.createdAt)}
                  </span>
                  <span className="block max-w-64 text-xs whitespace-normal">
                    {packingSummary(d.cart.packing)}
                  </span>
                </td>
                <td>
                  {d.cart.owner.name} · {d.cart.deliveryPhone}
                  <span className="block text-xs text-subtle">{d.cart.deliveryCity}</span>
                </td>
                <td>
                  {d.externalRef ?? d.provider}
                  {d.quotedFee && (
                    <span className="block text-xs text-subtle">
                      {formatLKR(d.quotedFee)} paid by owner
                    </span>
                  )}
                  {d.trackingUrl && (
                    <a
                      href={d.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-accent underline"
                    >
                      Track
                    </a>
                  )}
                </td>
                <td>
                  <Badge tone={STATUS_TONE[d.status]}>{label(d.status)}</Badge>
                  {d.driverName && (
                    <span className="block text-xs text-subtle">{d.driverName}</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-2">
                    {(["PICKED_UP", "DELIVERED", "FAILED"] as const)
                      .filter((s) => s !== d.status)
                      .map((s) => (
                        <form key={s} action={deliveryStatusAction}>
                          <input type="hidden" name="deliveryId" value={d.id} />
                          <input type="hidden" name="status" value={s} />
                          <Button variant="secondary" className="text-xs sm:min-h-8">
                            {label(s)}
                          </Button>
                        </form>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Recently delivered</h2>
        {delivered.length === 0 ? (
          <p className="text-sm text-subtle">None yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {delivered.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  <Link
                    href={`/admin/carts/${d.cart.code}`}
                    className="font-mono text-accent underline"
                  >
                    {d.cart.code}
                  </Link>{" "}
                  {d.cart.owner.name} · {d.cart.deliveryCity}
                  <span className="block text-xs text-subtle">
                    {packingSummary(d.cart.packing)}
                  </span>
                </span>
                <span className="text-subtle">{formatDateTime(d.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
