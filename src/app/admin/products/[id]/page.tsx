import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/client";
import { StockTable } from "@/components/stock-table";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { adjustStockAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { getProduct } from "@/server/catalogue";
import { db } from "@/server/db";
import { AdminForm } from "../../admin-form";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProduct(id);
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
          />
          <Card>
            <ProductForm product={product} />
          </Card>
        </div>
        <div className="flex flex-col gap-4">
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
