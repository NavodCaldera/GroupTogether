import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage, type ProductStatus } from "@/components/cart-bits";
import { Toast } from "@/components/toast";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { SellerStatusBadge } from "./seller-status";

export const metadata: Metadata = { title: "My products" };

/** What needs the seller first: products to fix, then drafts, then the rest. */
const RANK: Record<ProductStatus, number> = { DRAFT: 1, IN_REVIEW: 2, LIVE: 3, ARCHIVED: 4 };

/**
 * The factory seller's home (product owner, 2026-10-19): one "Add product" button and a card per
 * product with its status in plain words and how many pieces are left and sold. Sellers never
 * see buyers, carts or money (rule 11), so pieces held in carts count as left.
 */
export default async function SellerHome({ searchParams }: PageProps<"/seller">) {
  const seller = await requireSeller();
  const { done } = await searchParams;
  const [me, products] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: seller.id }, select: { company: true } }),
    db.product.findMany({
      where: { sellerId: seller.id },
      include: { variants: { select: { available: true, reserved: true, sold: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const rank = (p: (typeof products)[number]) =>
    p.reviewNote && p.status === "DRAFT" ? 0 : RANK[p.status];
  products.sort((a, b) => rank(a) - rank(b));

  return (
    <>
      {done === "saved" && <Toast>Saved.</Toast>}
      {done === "sent" && <Toast>Sent for review.</Toast>}
      {done === "deleted" && <Toast>Draft deleted.</Toast>}
      <PageHeader
        title="My products"
        description={me.company || seller.name}
        actions={<LinkButton href="/seller/products/new">Add product</LinkButton>}
      />

      {products.length === 0 ? (
        <EmptyState title="Nothing listed yet">
          <Link href="/seller/products/new" className="font-medium text-accent underline">
            Add your first product
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {products.map((p) => {
            const left = p.variants.reduce((n, v) => n + v.available + v.reserved, 0);
            const sold = p.variants.reduce((n, v) => n + v.sold, 0);
            const onSale = p.status === "LIVE" || p.status === "ARCHIVED";
            return (
              <li
                key={p.id}
                className="relative flex min-w-0 gap-3 rounded-xl border border-line p-3 hover:bg-muted/50"
              >
                <div className="w-14 shrink-0">
                  <ProductImage
                    photoKey={p.photoKey}
                    id={p.id}
                    title=""
                    category={p.category}
                    className="text-2xl"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <Link
                    href={`/seller/products/${p.id}`}
                    className="line-clamp-2 font-medium after:absolute after:inset-0 after:rounded-xl"
                  >
                    {p.brand} {p.title}
                  </Link>
                  <SellerStatusBadge status={p.status} reviewNote={p.reviewNote} />
                  <p className="text-sm text-subtle tabular-nums">
                    {formatLKR(p.price)} · {left}{" "}
                    {onSale ? "left" : left === 1 ? "piece" : "pieces"}
                    {onSale && ` · ${sold} sold`}
                  </p>
                  {p.status === "DRAFT" && p.reviewNote && (
                    <p className="line-clamp-2 text-sm text-danger">Fix: {p.reviewNote}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
