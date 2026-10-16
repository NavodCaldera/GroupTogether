import { Field, Input, Select, Textarea } from "@/components/ui";
import { saveProductAction } from "@/server/admin-actions";
import { AdminForm } from "../admin-form";

type ProductValues = {
  id: string;
  title: string;
  brand: string;
  description: string;
  category: string;
  stockType: string;
  defectNotes: string | null;
  price: { toString(): string };
  retailPrice: { toString(): string } | null;
  status: string;
};

export function ProductForm({ product }: { product?: ProductValues }) {
  return (
    <AdminForm action={saveProductAction} submit={product ? "Save product" : "Create product"}>
      {product && <input type="hidden" name="id" value={product.id} />}
      <Field label="Title" name="title">
        <Input name="title" defaultValue={product?.title} required />
      </Field>
      <Field label="Brand" name="brand">
        <Input name="brand" defaultValue={product?.brand} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" name="category">
          <Select name="category" defaultValue={product?.category ?? "SHOES"}>
            <option value="SHOES">Shoes</option>
            <option value="APPAREL">Apparel</option>
          </Select>
        </Field>
        <Field label="Stock type" name="stockType">
          <Select name="stockType" defaultValue={product?.stockType ?? "FACTORY_SURPLUS"}>
            <option value="FACTORY_SURPLUS">Factory surplus</option>
            <option value="B_GRADE">B-grade</option>
          </Select>
        </Field>
      </div>
      <Field label="Defects (required for B-grade, shown up front)" name="defectNotes">
        <Input name="defectNotes" defaultValue={product?.defectNotes ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Our price (LKR)" name="price">
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={product?.price.toString()}
            required
          />
        </Field>
        <Field label="Retail price (LKR, optional)" name="retailPrice">
          <Input
            name="retailPrice"
            inputMode="decimal"
            defaultValue={product?.retailPrice?.toString() ?? ""}
          />
        </Field>
      </div>
      <Field label="Description" name="description">
        <Textarea name="description" defaultValue={product?.description} rows={4} />
      </Field>
      <Field label="Photo (JPEG, PNG or WebP, up to 5 MB)" name="photo">
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm"
        />
      </Field>
      <Field label="Status" name="status">
        <Select name="status" defaultValue={product?.status ?? "DRAFT"}>
          <option value="DRAFT">Draft (hidden)</option>
          <option value="LIVE">Live</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
    </AdminForm>
  );
}
