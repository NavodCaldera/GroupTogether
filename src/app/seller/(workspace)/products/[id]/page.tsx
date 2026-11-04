import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm } from "@/app/admin/admin-form";
import { ProductForm } from "@/app/admin/products/product-form";
import { BackLink } from "@/components/client";
import { StockTable } from "@/components/stock-table";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { requireFactory } from "@/server/auth/session";
import { db } from "@/server/db";
import { factoryStockAction, saveFactoryProductAction } from "@/server/seller-actions";

export const metadata: Metadata = { title: "Edit product" };

/** A factory's own listing: details, and sizes with stock (product owner, 2026-11-03). */
export default async function FactoryProductPage({ params }: PageProps<"/seller/products/[id]">) {
  const seller = await requireFactory("products");
  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, sellerId: seller.factoryId, seller: { isBrand: false } },
    include: { variants: { orderBy: [{ size: "asc" }, { colour: "asc" }] } },
  });
  if (!product) notFound();
  return (
    <>
      <BackLink fallback="/seller" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <PageHeader
            title={product.title}
            actions={
              product.status === "ARCHIVED" && <Badge tone="bad">Hidden by GroupBasket</Badge>
            }
          />
          <Card>
            <ProductForm
              product={product}
              factory={{ brand: product.brand }}
              action={saveFactoryProductAction}
            />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-2 font-semibold">Stock by size</h2>
            <StockTable variants={product.variants} />
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Add or remove stock</h2>
            <AdminForm action={factoryStockAction} submit="Update stock">
              <input type="hidden" name="productId" value={product.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Size" name="size">
                  <Input name="size" placeholder="M or 32" required />
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
