import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm } from "@/app/admin/admin-form";
import { ProductForm } from "@/app/admin/products/product-form";
import { BackLink } from "@/components/client";
import { StockTable } from "@/components/stock-table";
import { VariantAxisFields } from "@/components/variant-axis-fields";
import { choiceAttributes, loadCategoryTree } from "@/server/categories";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { requireFactory } from "@/server/auth/session";
import { db } from "@/server/db";
import { kindOfSlug } from "@/lib/categories";
import { factoryStockAction, saveFactoryProductAction } from "@/server/seller-actions";
import { FitDataForm } from "@/components/fit-data-form";
import { saveFactoryFitAction } from "@/server/fit-actions";
import { MaterialSection } from "./material-section";
import { DealSection } from "./deal-section";

export const metadata: Metadata = { title: "Edit product" };

/** A factory's own listing: details, and sizes with stock (product owner, 2026-11-03). */
export default async function FactoryProductPage({ params }: PageProps<"/seller/products/[id]">) {
  const seller = await requireFactory("products");
  const { id } = await params;
  const product = await db.product.findFirst({
    where: { id, sellerId: seller.factoryId, seller: { isBrand: false } },
    include: { variants: { orderBy: { label: "asc" } } },
  });
  if (!product) notFound();
  const tree = await loadCategoryTree();
  const axes = choiceAttributes(tree, product.categoryId).filter((a) => a.isVariantAxis);
  // The clothing kind comes from the category (DEC-029); fit fields follow it.
  const kind = kindOfSlug(tree.get(product.categoryId)?.slug ?? "");
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
          <Card className="mt-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Fit data</h2>
              {product.sizeChart !== null && (
                <Badge tone={product.fitApprovedAt ? "good" : "neutral"}>
                  {product.fitApprovedAt ? "Approved" : "Waiting for check"}
                </Badge>
              )}
            </div>
            <FitDataForm
              product={{ ...product, kind }}
              action={saveFactoryFitAction}
              submit="Save fit data"
            />
          </Card>
          <MaterialSection productId={product.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <DealSection productId={product.id} factoryId={seller.factoryId} />
          <Card>
            <h2 className="mb-2 font-semibold">Stock</h2>
            <StockTable variants={product.variants} />
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Add or remove stock</h2>
            <AdminForm action={factoryStockAction} submit="Update stock">
              <input type="hidden" name="productId" value={product.id} />
              <VariantAxisFields axes={axes} />
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
