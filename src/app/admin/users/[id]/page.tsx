import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ADMIN_AREA_LABEL, userAdminArea } from "@/lib/admin-access";
import { formatDateTime, formatLKR } from "@/lib/format";
import { lockUserAction } from "@/server/admin-actions";
import { requireAnyAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";
import { Table } from "../../list-bits";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const admin = await requireAnyAdmin();
  const { id } = await params;
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id },
    include: {
      buyerOrders: {
        select: { id: true, status: true, amountDue: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: {
        select: { sessions: { where: { expiresAt: { gt: now } } }, products: true },
      },
    },
  });
  // Only the area that manages the account may open it.
  if (!user || userAdminArea(user) !== admin.adminArea) notFound();
  const pending = user.buyerOrders.filter((o) => o.status === "PENDING").length;

  return (
    <>
      <BackLink fallback="/admin/users" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <PageHeader
            title={user.name}
            description={`${user.email} · ${user.phone ?? "no mobile"}`}
            actions={
              <>
                {user.role === "ADMIN" && (
                  <Badge tone="info">{ADMIN_AREA_LABEL[user.adminArea ?? ""] ?? "Admin"}</Badge>
                )}
                {user.role === "SELLER" && (
                  <Badge tone="info">{user.isBrand ? "Luxury brand" : "Factory seller"}</Badge>
                )}
                {user.role === "AGENT" && <Badge tone="info">Agent</Badge>}
                {user.locked && <Badge tone="bad">Locked</Badge>}
              </>
            }
          />

          {user.isBrand && (
            <Card>
              <Link
                href={`/admin/brands?tab=products&brand=${user.id}`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent"
              >
                Open premium brand workspace →
              </Link>
            </Card>
          )}
          {user.role === "SELLER" && (
            <Card className="text-sm">
              <h2 className="mb-1 font-semibold">{user.company}</h2>
              <p className="text-subtle">
                {user._count.products} {user._count.products === 1 ? "product" : "products"} listed
                ·{" "}
                <Link href={`/admin/products?seller=${user.id}`} className="text-accent underline">
                  see their products
                </Link>
              </p>
            </Card>
          )}
          {user.buyerOrders.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-semibold">Orders ({user.buyerOrders.length})</h2>
              <Table
                head={
                  <>
                    <th>Order</th>
                    <th>Status</th>
                    <th className="text-right">Paid or due</th>
                    <th>Placed</th>
                  </>
                }
              >
                {user.buyerOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="font-mono">{o.id.slice(-8).toUpperCase()}</td>
                    <td>
                      <Badge>{o.status.toLowerCase()}</Badge>
                    </td>
                    <td className="text-right">{formatLKR(o.amountDue)}</td>
                    <td className="text-subtle">{formatDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </Table>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="text-sm">
            <h2 className="mb-2 font-semibold">Account</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-subtle">Signed up</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
              <dt className="text-subtle">Address</dt>
              <dd>
                {user.address ?? "—"}
                {user.city && `, ${user.city}`}
              </dd>
              <dt className="text-subtle">Signed in on</dt>
              <dd>
                {user._count.sessions} {user._count.sessions === 1 ? "device" : "devices"}
              </dd>
            </dl>
          </Card>

          {user.role !== "ADMIN" && (
            <Card>
              <h2 className="mb-2 font-semibold">
                {user.locked ? "Unlock account" : "Lock account"}
              </h2>
              {!user.locked && pending > 0 && (
                <div className="mb-3">
                  <Alert tone="info">
                    {pending} unpaid {pending === 1 ? "order" : "orders"} holding stock.
                  </Alert>
                </div>
              )}
              <AdminForm
                action={lockUserAction}
                submit={user.locked ? "Unlock" : "Lock and sign out"}
                variant={user.locked ? "secondary" : "danger"}
              >
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="locked" value={user.locked ? "0" : "1"} />
              </AdminForm>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
