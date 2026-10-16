import type { Metadata } from "next";
import Link from "next/link";
import {
  PRODUCT_STATUS_LABEL,
  type ProductStatus,
  ProductStatusBadge,
  StockTypeBadge,
} from "@/components/cart-bits";
import { Alert, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Seller dashboard" };

const ORDER: ProductStatus[] = ["DRAFT", "IN_REVIEW", "LIVE", "ARCHIVED"];

export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const { deleted } = await searchParams;
  const products = await db.product.findMany({
    where: { sellerId: seller.id },
    include: { variants: { select: { available: true, reserved: true, sold: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const count = (s: ProductStatus) => products.filter((p) => p.status === s).length;
  const returned = products.filter((p) => p.status === "DRAFT" && p.reviewNote);
  const units = (k: "available" | "reserved" | "sold", list = products) =>
    list.reduce((n, p) => n + p.variants.reduce((m, v) => m + v[k], 0), 0);
  const live = products.filter((p) => p.status === "LIVE");

  return (
    <>
      <PageHeader
        title="My products"
        description="List your stock here. GroupTogether reviews each product and puts it on sale once your stock reaches our store."
        actions={<LinkButton href="/seller/products/new">Add product</LinkButton>}
      />
      {deleted && <Alert tone="good">Draft deleted.</Alert>}

      {returned.length > 0 && (
        <Alert tone="bad">
          {returned.length === 1 ? "1 product needs" : `${returned.length} products need`} changes
          before review:{" "}
          {returned.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/seller/products/${p.id}`} className="underline">
                {p.brand} {p.title}
              </Link>
            </span>
          ))}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {ORDER.map((s) => (
          <Card key={s}>
            <p className="text-3xl font-bold">{count(s)}</p>
            <p className="mt-1 text-sm text-subtle">{PRODUCT_STATUS_LABEL[s]}</p>
          </Card>
        ))}
      </div>
      <p className="text-sm text-subtle">
        Live stock: {units("available", live)} pieces free, {units("reserved", live)} held in
        shoppers&apos; carts, {units("sold", live)} sold.
      </p>

      {products.length === 0 ? (
        <EmptyState title="You haven't listed anything yet">
          <Link href="/seller/products/new" className="font-medium text-accent underline">
            Add your first product
          </Link>
          , add stock by size, then submit it for review.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted text-left text-xs text-subtle">
              <tr className="[&>th]:px-3 [&>th]:py-2">
                <th>Product</th>
                <th>Type</th>
                <th className="text-right">Price</th>
                <th className="text-right">Free</th>
                <th className="text-right">In carts</th>
                <th className="text-right">Sold</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2">
              {products.map((p) => {
                const sum = (k: "available" | "reserved" | "sold") =>
                  p.variants.reduce((n, v) => n + v[k], 0);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/seller/products/${p.id}`} className="text-accent underline">
                        {p.brand} {p.title}
                      </Link>
                    </td>
                    <td>
                      <StockTypeBadge stockType={p.stockType} />
                    </td>
                    <td className="text-right">{formatLKR(p.price)}</td>
                    <td className="text-right">{sum("available")}</td>
                    <td className="text-right">{sum("reserved")}</td>
                    <td className="text-right">{sum("sold")}</td>
                    <td>
                      <ProductStatusBadge status={p.status} />
                      {p.status === "DRAFT" && p.reviewNote && (
                        <span className="ml-2 text-xs text-danger">Changes needed</span>
                      )}
                    </td>
                    <td className="text-subtle">{formatDateTime(p.updatedAt)}</td>
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
