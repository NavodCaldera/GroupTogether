import { TaxonomyFields } from "@/components/taxonomy-fields";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { type AdminState, saveProductAction } from "@/server/admin-actions";
import { AdminForm } from "../admin-form";

type ProductValues = {
  id: string;
  title: string;
  brand: string;
  description: string;
  audience: string | null;
  kind: string | null;
  stockType: string;
  price: { toString(): string };
  retailPrice: { toString(): string } | null;
  status: string;
};

/** The admin's product details form. Factory sellers send stock offers instead (`src/server/offers.ts`). */
export function ProductForm({
  product,
  action = saveProductAction,
}: {
  product?: ProductValues;
  action?: (prev: AdminState, fd: FormData) => Promise<AdminState>;
}) {
  return (
    <AdminForm action={action} submit={product ? "Save product" : "Create product"}>
      {product && <input type="hidden" name="id" value={product.id} />}
      <Field label="Title" name="title">
        <Input name="title" defaultValue={product?.title} required />
      </Field>
      <Field label="Brand" name="brand">
        <Input name="brand" defaultValue={product?.brand} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <TaxonomyFields
          audience={product?.audience}
          kind={product?.kind}
          selectClass="min-h-11 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink sm:min-h-10 sm:text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stock type" name="stockType">
          <Select name="stockType" defaultValue={product?.stockType ?? "FACTORY_SURPLUS"}>
            <option value="FACTORY_SURPLUS">Factory surplus</option>
            <option value="B_GRADE">B-grade</option>
          </Select>
        </Field>
      </div>
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
          <option value="IN_REVIEW">In review (seller submitted)</option>
          <option value="LIVE">Live</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
      </Field>
    </AdminForm>
  );
}
