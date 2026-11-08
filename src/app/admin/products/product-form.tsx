import { FactoryPriceInput } from "@/components/factory-price-input";
import { TaxonomyFields } from "@/components/taxonomy-fields";
import { Field, Input, Textarea } from "@/components/ui";
import { type AdminState, saveProductAction } from "@/server/admin-actions";
import { AdminForm } from "../admin-form";

type ProductValues = {
  id: string;
  title: string;
  brand: string;
  description: string;
  audience: string | null;
  kind: string | null;
  price: { toString(): string };
  factoryPrice?: { toString(): string } | null;
  commission?: { toString(): string } | null;
  retailPrice: { toString(): string } | null;
  brandUrl: string | null;
};

/** Product details: the admin's form, and a factory's own listing with `factory` (2026-11-03). */
export function ProductForm({
  product,
  action = saveProductAction,
  factory,
}: {
  /** A factory's own listing: its own price and brand, no brand link. */
  factory?: { brand: string; commission?: string };
  product?: ProductValues;
  action?: (prev: AdminState, fd: FormData) => Promise<AdminState>;
}) {
  const commission = product?.commission?.toString() ?? factory?.commission;
  return (
    <AdminForm
      action={action}
      submit={product ? "Save product" : factory ? "Publish" : "Create product"}
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      <Field label="Title" name="title">
        <Input name="title" defaultValue={product?.title} required />
      </Field>
      <Field label="Brand" name="brand">
        <Input name="brand" defaultValue={product?.brand ?? factory?.brand} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <TaxonomyFields
          audience={product?.audience}
          kind={product?.kind}
          selectClass="min-h-11 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink sm:min-h-10 sm:text-sm"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {commission !== undefined ? (
          <FactoryPriceInput
            initial={(product?.factoryPrice ?? product?.price)?.toString()}
            commission={commission}
          />
        ) : (
          <Field label={factory ? "Price (LKR)" : "Our price (LKR)"} name="price">
            <Input
              name="price"
              inputMode="decimal"
              defaultValue={product?.price.toString()}
              required
            />
          </Field>
        )}
        <Field label="Retail price (LKR, optional)" name="retailPrice">
          <Input
            name="retailPrice"
            inputMode="decimal"
            defaultValue={product?.retailPrice?.toString() ?? ""}
          />
        </Field>
      </div>
      {!factory && (
        <Field label="Brand link (optional)" name="brandUrl">
          <Input
            name="brandUrl"
            type="url"
            placeholder="https://"
            defaultValue={product?.brandUrl ?? ""}
          />
        </Field>
      )}
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
    </AdminForm>
  );
}
