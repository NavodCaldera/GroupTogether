import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_STATUS_LABEL, ProductStatusBadge } from "@/components/cart-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import type { ProductStatus } from "@/generated/prisma/client";
import { formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { LOW_STOCK } from "@/server/admin-queries";
import { db } from "@/server/db";
import { Chip, ChipRow, Count, SearchForm, hrefWith, param } from "../list-bits";

export const metadata: Metadata = { title: "Products" };

const STATUSES: ProductStatus[] = ["IN_REVIEW", "LIVE", "DRAFT", "ARCHIVED"];

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === param(sp, "status"));
  const low = param(sp, "stock") === "low";
  const q = param(sp, "q");
  const sellerId = param(sp, "seller");
  const [products, inReview, seller] = await Promise.all([
    db.product.findMany({
      where: {
        sellerId,
        status: low ? "LIVE" : status,
        variants: low ? { some: { available: { lte: LOW_STOCK } } } : undefined,
        OR: q
          ? [
              { title: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: {
        variants: { select: { available: true, reserved: true, sold: true } },
        seller: { select: { name: true, company: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.product.count({ where: { status: "IN_REVIEW" } }),
    sellerId
      ? db.user.findUnique({ where: { id: sellerId }, select: { name: true, company: true } })
      : null,
  ]);
  const href = (values: Record<string, string | undefined>) =>
    hrefWith("/admin/products", { q, seller: sellerId, ...values });
  return (
    <>
      <PageHeader
        title={seller ? `Products from ${seller.company || seller.name}` : "Products"}
        actions={
          <Link
            href="/admin/products/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent"
          >
            Add product
          </Link>
        }
      />
      <SearchForm action="/admin/products" q={q} placeholder="Title or brand" />
      <ChipRow>
        <Chip href={href({})} active={!status && !low}>
          All
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} href={href({ status: s })} active={status === s && !low}>
            {PRODUCT_STATUS_LABEL[s]}
            {s === "IN_REVIEW" && <Count n={inReview} tone="alert" />}
          </Chip>
        ))}
        {sellerId && (
          <Chip href={hrefWith("/admin/products", { q, status })} active={false}>
            All sellers ✕
          </Chip>
        )}
        <Chip href={href({ stock: "low" })} active={low}>
          Low stock (≤ {LOW_STOCK} free in a size)
        </Chip>
      </ChipRow>
      {products.length === 0 ? (
        <EmptyState title={q || status || low ? "No products match" : "No products yet"} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted text-left text-xs text-subtle">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Seller</th>
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
                    <td className="px-3 py-2 text-subtle">
                      {p.sellerId ? (
                        <Link href={href({ seller: p.sellerId })} className="hover:underline">
                          {p.seller?.company || p.seller?.name}
                        </Link>
                      ) : (
                        "Ours"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{formatLKR(p.price)}</td>
                    <td className="px-3 py-2 text-right">{sum("available")}</td>
                    <td className="px-3 py-2 text-right">{sum("reserved")}</td>
                    <td className="px-3 py-2 text-right">{sum("sold")}</td>
                    <td className="px-3 py-2">
                      <ProductStatusBadge status={p.status} />
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
