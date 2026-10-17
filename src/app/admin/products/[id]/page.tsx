import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/client";
import { ProductStatusBadge } from "@/components/cart-bits";
import { StockTable } from "@/components/stock-table";
import { Alert, Card, Field, Input, PageHeader } from "@/components/ui";
import {
  adjustStockAction,
  publishProductAction,
  returnProductAction,
} from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { getProduct } from "@/server/catalogue";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const [{ id }, { reviewed }] = await Promise.all([params, searchParams]);
  const product = await getProduct(id, { live: false });
  if (!product) notFound();
  const seller = product.sellerId
    ? await db.user.findUnique({
        where: { id: product.sellerId },
        select: { id: true, name: true, company: true, phone: true },
      })
    : null;
  return (
    <>
      <BackLink fallback="/admin/products" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <PageHeader
            title={`${product.brand} ${product.title}`}
            description={
              seller ? (
                <>
                  Listed by{" "}
                  <Link href={`/admin/users/${seller.id}`} className="text-accent underline">
                    {seller.company || seller.name}
                  </Link>{" "}
                  · {seller.name} · {seller.phone}
                </>
              ) : (
                "Our own listing"
              )
            }
            actions={<ProductStatusBadge status={product.status} />}
          />
          {reviewed === "published" && (
            <div className="mb-4">
              <Alert tone="good">Published: it is on sale now. The seller has been notified.</Alert>
            </div>
          )}
          {product.status === "DRAFT" && product.reviewNote && (
            <div className="mb-4">
              <Alert tone={reviewed === "returned" ? "good" : "info"}>
                Returned to the seller{reviewed === "returned" ? " and notified them" : ""}:{" "}
                {product.reviewNote}
              </Alert>
            </div>
          )}
          <Card>
            <ProductForm product={product} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          {product.status === "IN_REVIEW" && (
            <Card className="border-accent">
              <h2 className="mb-1 font-semibold">Seller submitted this for review</h2>
              <p className="mb-3 text-sm text-subtle">
                Check the details and defects, and that the stock below has reached our store,
                before publishing.
              </p>
              <div className="flex flex-col gap-3">
                <AdminForm action={publishProductAction} submit="Publish: put it on sale">
                  <input type="hidden" name="productId" value={product.id} />
                </AdminForm>
                <AdminForm
                  action={returnProductAction}
                  submit="Return to seller"
                  variant="secondary"
                >
                  <input type="hidden" name="productId" value={product.id} />
                  <Input name="note" placeholder="What should they change?" required />
                </AdminForm>
              </div>
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-semibold">Stock by size</h2>
            <StockTable variants={product.variants} />
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Add or remove stock</h2>
            <AdminForm action={adjustStockAction} submit="Update stock">
              <input type="hidden" name="productId" value={product.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Size" name="size">
                  <Input name="size" placeholder="UK 9 or M" required />
                </Field>
                <Field label="Colour (optional)" name="colour">
                  <Input name="colour" />
                </Field>
              </div>
              <Field label="Change (+ adds, − removes free stock)" name="delta">
                <Input name="delta" type="number" step={1} placeholder="e.g. 12 or -2" required />
              </Field>
            </AdminForm>
          </Card>
        </div>
      </div>
    </>
  );
}
