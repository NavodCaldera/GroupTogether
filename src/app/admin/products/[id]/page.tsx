import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { adjustStockAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { getProduct } from "@/server/catalogue";
import { AdminForm } from "../../admin-form";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/admin/products/[id]">) {
  await requireAdmin();
  const product = await getProduct((await params).id, { live: false });
  if (!product) notFound();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <PageHeader title={`${product.brand} ${product.title}`} />
        <Card>
          <ProductForm product={product} />
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <h2 className="mb-2 font-semibold">Stock by size</h2>
          {product.variants.length === 0 ? (
            <p className="text-sm text-subtle">No sizes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th>Size</th>
                  <th className="text-right">Free</th>
                  <th className="text-right">In carts</th>
                  <th className="text-right">Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="py-1">
                      {v.size}
                      {v.colour && <span className="text-subtle"> · {v.colour}</span>}
                    </td>
                    <td className="py-1 text-right">{v.available}</td>
                    <td className="py-1 text-right">{v.reserved}</td>
                    <td className="py-1 text-right">{v.sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
  );
}
