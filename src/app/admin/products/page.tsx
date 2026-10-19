import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { formatLKR } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { LOW_STOCK } from "@/server/admin-queries";
import { IN_SHOP } from "@/server/catalogue";
import { db } from "@/server/db";
import { Chip, ChipRow, SearchForm, hrefWith, param } from "../list-bits";

export const metadata: Metadata = { title: "Products" };

/** No product statuses (product owner, 2026-10-20): stock decides what is in the shop. */
const FILTERS: Record<string, Prisma.ProductWhereInput> = {
  shop: IN_SHOP,
  none: { variants: { none: { available: { gt: 0 } } } },
  low: { ...IN_SHOP, AND: { variants: { some: { available: { lte: LOW_STOCK } } } } },
};

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin();
  const sp = await searchParams;
  const f = param(sp, "filter") || (param(sp, "stock") === "low" ? "low" : undefined);
  const filter = f && f in FILTERS ? f : undefined;
  const q = param(sp, "q");
  const sellerId = param(sp, "seller");
  const [products, seller] = await Promise.all([
    db.product.findMany({
      where: {
        sellerId,
        ...(filter ? FILTERS[filter] : {}),
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
    sellerId
      ? db.user.findUnique({ where: { id: sellerId }, select: { name: true, company: true } })
      : null,
  ]);
  const href = (values: Record<string, string | undefined>) =>
    hrefWith("/admin/products", { q, filter, seller: sellerId, ...values });
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
        <Chip href={href({ filter: undefined })} active={!filter}>
          All
        </Chip>
        <Chip href={href({ filter: "shop" })} active={filter === "shop"}>
          In the shop
        </Chip>
        <Chip href={href({ filter: "none" })} active={filter === "none"}>
          Not in the shop
        </Chip>
        {sellerId && (
          <Chip href={hrefWith("/admin/products", { q, filter })} active={false}>
            All sellers ✕
          </Chip>
        )}
        <Chip href={href({ filter: "low" })} active={filter === "low"}>
          Low stock (≤ {LOW_STOCK} free in a size)
        </Chip>
      </ChipRow>
      {products.length === 0 ? (
        <EmptyState title={q || filter ? "No products match" : "No products yet"} />
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
