import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { type CartStatus, STATUS_LABEL } from "@/lib/cart-rules";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Carts" };

const STATUSES = Object.keys(STATUS_LABEL) as CartStatus[];

export default async function AdminCartsPage({ searchParams }: PageProps<"/admin/carts">) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = STATUSES.find((s) => s === status);
  const carts = await db.groupCart.findMany({
    where: { status: filter },
    include: { owner: { select: { name: true } }, _count: { select: { members: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-accent bg-accent text-on-accent" : "border-line hover:bg-muted"}`;
  return (
    <>
      <PageHeader title="Carts" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/carts" className={chip(!filter)}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/carts?status=${s}`} className={chip(filter === s)}>
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>
      {carts.length === 0 ? (
        <EmptyState title="No carts" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-subtle">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {carts.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/carts/${c.code}`}
                      className="font-mono text-accent underline"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.owner.name}</td>
                  <td className="px-3 py-2">{c._count.members}</td>
                  <td className="px-3 py-2 text-right">{formatLKR(c.total)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2 text-subtle">{formatDateTime(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
