import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/cart-bits";
import { BackLink } from "@/components/client";
import { Alert, Card, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { deleteDraftAction, editAction } from "@/server/seller-actions";
import { AdminForm } from "../../../admin/admin-form";
import { ListingForm } from "../../listing-form";
import { SellerStatusBadge } from "../../seller-status";

export const metadata: Metadata = { title: "My product" };

/**
 * One of the seller's products. A draft is its one-screen form (with the admin's note if it came
 * back). After that it is read-only: sizes with pieces left and sold, and "Edit" while it is
 * still waiting for review. A live product is managed by GroupBasket (rule 11).
 */
export default async function SellerProductPage({ params }: PageProps<"/seller/products/[id]">) {
  const seller = await requireSeller();
  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, sellerId: seller.id },
    include: { variants: { orderBy: [{ size: "asc" }, { colour: "asc" }] } },
  });
  if (!product) notFound();
  const name = `${product.brand} ${product.title}`;
  const header = (
    <PageHeader
      title={name}
      actions={<SellerStatusBadge status={product.status} reviewNote={product.reviewNote} />}
    />
  );

  if (product.status === "DRAFT") {
    const stock = Object.fromEntries(
      product.variants.filter((v) => !v.colour).map((v) => [v.size, v.available]),
    );
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <div>
          <BackLink fallback="/seller" />
          {header}
        </div>
        {product.reviewNote && <Alert>Fix this: {product.reviewNote}</Alert>}
        <Card>
          <ListingForm
            product={{
              ...product,
              price: product.price.toString(),
              retailPrice: product.retailPrice?.toString() ?? null,
              hasPhoto: !!product.photoKey,
            }}
            stock={stock}
          />
        </Card>
        <AdminForm action={deleteDraftAction} submit="Delete draft" variant="secondary">
          <input type="hidden" name="productId" value={product.id} />
        </AdminForm>
      </div>
    );
  }

  const live = product.status === "LIVE" || product.status === "ARCHIVED";
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <BackLink fallback="/seller" />
        {header}
      </div>
      <p className="text-sm text-subtle">
        {product.status === "IN_REVIEW"
          ? "Send the stock to our store. We put it on sale when it arrives."
          : product.status === "LIVE"
            ? "On sale. To change it, contact GroupBasket."
            : "No longer on sale."}
      </p>

      <Card className="flex gap-4">
        <div className="w-20 shrink-0">
          <ProductImage
            photoKey={product.photoKey}
            id={product.id}
            title={name}
            category={product.category}
            className="text-3xl"
          />
        </div>
        <div className="min-w-0 text-sm">
          <p className="font-medium">{formatLKR(product.price)}</p>
          <p className="text-subtle">
            {product.stockType === "B_GRADE" ? "B-grade" : "Factory surplus"}
          </p>
        </div>
      </Card>

      <Card>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-xs text-subtle">
            <tr>
              <th className="py-1 font-normal">Size</th>
              <th className="py-1 text-right font-normal">{live ? "Left" : "Pieces"}</th>
              {live && <th className="py-1 text-right font-normal">Sold</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {product.variants.map((v) => (
              <tr key={v.id}>
                <td className="py-1.5">
                  {v.size}
                  {v.colour && <span className="text-subtle"> · {v.colour}</span>}
                </td>
                <td className="py-1.5 text-right">{v.available + v.reserved}</td>
                {live && <td className="py-1.5 text-right">{v.sold}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {product.status === "IN_REVIEW" && (
        <AdminForm action={editAction} submit="Edit" variant="secondary">
          <input type="hidden" name="productId" value={product.id} />
        </AdminForm>
      )}
    </div>
  );
}
