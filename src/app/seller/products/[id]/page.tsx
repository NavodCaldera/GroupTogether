import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/client";
import { ProductStatusBadge, StockTypeBadge } from "@/components/cart-bits";
import { StockTable } from "@/components/stock-table";
import { Alert, Card, Field, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import {
  deleteDraftAction,
  sellerSaveProductAction,
  sellerStockAction,
  submitForReviewAction,
  withdrawAction,
} from "@/server/seller-actions";
import { AdminForm } from "../../../admin/admin-form";
import { ProductForm } from "../../../admin/products/product-form";

export const metadata: Metadata = { title: "My product" };

export default async function SellerProductPage({
  params,
  searchParams,
}: PageProps<"/seller/products/[id]">) {
  const seller = await requireSeller();
  const [{ id }, { created, submitted, withdrawn }] = await Promise.all([params, searchParams]);
  const product = await db.product.findFirst({
    where: { id, sellerId: seller.id },
    include: { variants: { orderBy: [{ size: "asc" }, { colour: "asc" }] } },
  });
  if (!product) notFound();
  const draft = product.status === "DRAFT";
  const hasStock = product.variants.some((v) => v.available > 0);

  return (
    <>
      <BackLink fallback="/seller" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <PageHeader
            title={`${product.brand} ${product.title}`}
            description={`Updated ${formatDateTime(product.updatedAt)}`}
            actions={<ProductStatusBadge status={product.status} />}
          />
          {created && (
            <Alert tone="good">Draft created. Now add stock for each size you have.</Alert>
          )}
          {submitted && (
            <Alert tone="good">
              Submitted. GroupTogether will publish it once your stock reaches our store.
            </Alert>
          )}
          {withdrawn && draft && (
            <Alert tone="good">Withdrawn. Make your changes, then submit it again.</Alert>
          )}
          {draft && product.reviewNote && (
            <Alert>Changes requested by GroupTogether: {product.reviewNote}</Alert>
          )}
          {product.status === "IN_REVIEW" && (
            <Alert tone="info">
              In review. You can&apos;t change it while GroupTogether checks it; withdraw it to make
              changes.
            </Alert>
          )}
          {(product.status === "LIVE" || product.status === "ARCHIVED") && (
            <Alert tone="info">
              {product.status === "LIVE" ? "On sale now." : "No longer on sale."} GroupTogether
              holds the stock and manages this listing. Ask us if anything needs to change.
            </Alert>
          )}

          <Card>
            {draft ? (
              <ProductForm product={product} action={sellerSaveProductAction} seller />
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-subtle">Type</dt>
                <dd>
                  <StockTypeBadge stockType={product.stockType} />
                </dd>
                <dt className="text-subtle">Price</dt>
                <dd>
                  {formatLKR(product.price)}
                  {product.retailPrice && (
                    <span className="text-subtle"> (retail {formatLKR(product.retailPrice)})</span>
                  )}
                </dd>
                {product.description && (
                  <>
                    <dt className="text-subtle">Description</dt>
                    <dd className="whitespace-pre-line">{product.description}</dd>
                  </>
                )}
              </dl>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Stock by size</h2>
            <StockTable variants={product.variants} />
          </Card>

          {draft && (
            <>
              <Card>
                <h2 className="mb-2 font-semibold">Add or remove stock</h2>
                <AdminForm action={sellerStockAction} submit="Update stock">
                  <input type="hidden" name="productId" value={product.id} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Size" name="size">
                      <Input name="size" placeholder="UK 9 or M" required />
                    </Field>
                    <Field label="Colour (optional)" name="colour">
                      <Input name="colour" />
                    </Field>
                  </div>
                  <Field label="Change (+ adds, − removes)" name="delta">
                    <Input
                      name="delta"
                      type="number"
                      step={1}
                      placeholder="e.g. 12 or -2"
                      required
                    />
                  </Field>
                </AdminForm>
              </Card>
              <Card>
                <h2 className="mb-2 font-semibold">Ready to sell?</h2>
                <p className="mb-3 text-sm text-subtle">
                  {hasStock
                    ? "Submit it, then send the stock to our store. We publish it once it arrives."
                    : "Add stock for at least one size first."}
                </p>
                <AdminForm action={submitForReviewAction} submit="Submit for review">
                  <input type="hidden" name="productId" value={product.id} />
                </AdminForm>
              </Card>
              <AdminForm action={deleteDraftAction} submit="Delete this draft" variant="secondary">
                <input type="hidden" name="productId" value={product.id} />
              </AdminForm>
            </>
          )}

          {product.status === "IN_REVIEW" && (
            <AdminForm
              action={withdrawAction}
              submit="Withdraw to make changes"
              variant="secondary"
            >
              <input type="hidden" name="productId" value={product.id} />
            </AdminForm>
          )}
        </aside>
      </div>
    </>
  );
}
