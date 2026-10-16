import type { Metadata } from "next";
import Link from "next/link";
import { StockTypeBadge } from "@/components/cart-bits";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Products" };

export default async function AdminProductsPage() {
  await requireAdmin();
  const products = await db.product.findMany({
    include: { variants: { select: { available: true, reserved: true, sold: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <>
      <PageHeader
        title="Products"
        actions={
          <Link
            href="/admin/products/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
          >
            Add product
          </Link>
        }
      />
      {products.length === 0 ? (
        <EmptyState title="No products yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-subtle">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Free</th>
                <th className="px-3 py-2 text-right">In carts</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((p) => {
                const sum = (k: "available" | "reserved" | "sold") =>
                  p.variants.reduce((n, v) => n + v[k], 0);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <Link href={`/admin/products/${p.id}`} className="text-accent underline">
                        {p.brand} {p.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <StockTypeBadge stockType={p.stockType} />
                    </td>
                    <td className="px-3 py-2 text-right">{formatLKR(p.price)}</td>
                    <td className="px-3 py-2 text-right">{sum("available")}</td>
                    <td className="px-3 py-2 text-right">{sum("reserved")}</td>
                    <td className="px-3 py-2 text-right">{sum("sold")}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "LIVE" ? "good" : "neutral"}>{p.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
