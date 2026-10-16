import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/cart-bits";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { HOLDS_STOCK, cartTotal } from "@/lib/cart-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import { lockUserAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";
import { Table } from "../../list-bits";

export const metadata: Metadata = { title: "User" };

export default async function AdminUserPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) {
  await requireAdmin();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          cart: {
            select: {
              code: true,
              name: true,
              status: true,
              total: true,
              ownerId: true,
              updatedAt: true,
              lines: { where: { userId: id }, select: { qty: true, unitPrice: true } },
            },
          },
        },
        orderBy: { joinedAt: "desc" },
        take: 50,
      },
      slips: {
        include: { cart: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: {
        select: { sessions: { where: { expiresAt: { gt: now } } }, products: true },
      },
    },
  });
  if (!user) notFound();
  const active = user.memberships.filter((m) => HOLDS_STOCK.includes(m.cart.status));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader
          title={user.name}
          description={`${user.email} · ${user.phone ?? "no mobile"}`}
          actions={
            <>
              {user.role === "ADMIN" && <Badge tone="info">Admin</Badge>}
              {user.role === "SELLER" && <Badge tone="warn">Factory seller</Badge>}
              {user.locked && <Badge tone="bad">Locked</Badge>}
            </>
          }
        />

        {created && (
          <Alert tone="good">
            Seller account created. Send them their email and password; they sign in at /sign-in and
            land on their seller dashboard.
          </Alert>
        )}
        {user.role === "SELLER" && (
          <Card className="text-sm">
            <h2 className="mb-1 font-semibold">{user.company}</h2>
            <p className="text-subtle">
              {user._count.products} {user._count.products === 1 ? "product" : "products"} listed ·{" "}
              <Link href={`/admin/products?seller=${user.id}`} className="text-accent underline">
                see their products
              </Link>
            </p>
          </Card>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Carts ({user.memberships.length})</h2>
          {user.memberships.length === 0 ? (
            <p className="text-sm text-subtle">Hasn&apos;t joined any cart.</p>
          ) : (
            <Table
              head={
                <>
                  <th>Cart</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="text-right">Their items</th>
                  <th className="text-right">Cart total</th>
                  <th>Updated</th>
                </>
              }
            >
              {user.memberships.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link
                      href={`/admin/carts/${m.cart.code}`}
                      className="font-mono text-accent underline"
                    >
                      {m.cart.code}
                    </Link>
                    {m.cart.name && <span className="text-subtle"> · {m.cart.name}</span>}
                  </td>
                  <td>{m.cart.ownerId === user.id ? "Owner" : "Member"}</td>
                  <td>
                    <StatusBadge status={m.cart.status} />
                  </td>
                  <td className="text-right">{formatLKR(cartTotal(m.cart.lines))}</td>
                  <td className="text-right">{formatLKR(m.cart.total)}</td>
                  <td className="text-subtle">{formatDateTime(m.cart.updatedAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </section>

        {user.slips.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Bank slips uploaded</h2>
            <ul className="divide-y divide-line rounded-xl border border-line text-sm">
              {user.slips.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span>
                    <Link
                      href={`/admin/carts/${s.cart.code}`}
                      className="font-mono text-accent underline"
                    >
                      {s.cart.code}
                    </Link>{" "}
                    · {formatLKR(s.amount)} · {formatDateTime(s.createdAt)}
                    {s.reviewNote && <span className="text-subtle"> · {s.reviewNote}</span>}
                  </span>
                  <Badge
                    tone={
                      s.status === "APPROVED" ? "good" : s.status === "REJECTED" ? "bad" : "warn"
                    }
                  >
                    {s.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
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
            {user.locked ? (
              <p className="mb-3 text-sm text-subtle">
                This account can&apos;t sign in. Unlocking lets them sign in again.
              </p>
            ) : (
              <p className="mb-3 text-sm text-subtle">
                Locking signs them out everywhere and stops them signing in. Their carts stay as
                they are.
              </p>
            )}
            {!user.locked && active.length > 0 && (
              <div className="mb-3">
                <Alert tone="info">
                  They are in {active.length} unpaid {active.length === 1 ? "cart" : "carts"}{" "}
                  holding stock. Cancel those from the cart page if they should not go ahead.
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
  );
}
