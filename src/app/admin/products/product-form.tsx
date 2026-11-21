import { FactoryPriceInput } from "@/components/factory-price-input";
import { TaxonomyFields } from "@/components/taxonomy-fields";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { readSpecs } from "@/lib/product-specs";
import { type AdminState, saveProductAction } from "@/server/admin-actions";
import { categoryChoices } from "@/server/categories";
import { AdminForm } from "../admin-form";

type ProductValues = {
  id: string;
  title: string;
  brand: string;
  description: string;
  categoryId: string;
  price: { toString(): string };
  factoryPrice?: { toString(): string } | null;
  commission?: { toString(): string } | null;
  retailPrice: { toString(): string } | null;
  brandUrl: string | null;
  specs: unknown;
  condition: string;
  sellUnit: string;
  minOrderQty: number;
  stepQty: number;
  shelfLifeDays: number | null;
  hazmat: boolean;
};

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "FACTORY_SURPLUS", label: "Factory surplus" },
  { value: "B_GRADE", label: "B-grade" },
  { value: "REFURBISHED", label: "Refurbished" },
];

const UNITS = ["piece", "pack", "box", "kg"];

/** Product details: the admin's form, and a factory's own listing with `factory` (2026-11-03). */
export async function ProductForm({
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
  const groups = await categoryChoices();
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
      <TaxonomyFields
        groups={groups}
        category={product?.categoryId}
        specs={readSpecs(product?.specs)}
        selectClass="min-h-11 rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink sm:min-h-10 sm:text-sm"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Condition" name="condition">
          <Select name="condition" defaultValue={product?.condition ?? "NEW"}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sold by" name="sellUnit">
          <Select name="sellUnit" defaultValue={product?.sellUnit ?? "piece"}>
            {[...new Set([...UNITS, product?.sellUnit ?? "piece"])].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Minimum order" name="minOrderQty">
          <Input
            name="minOrderQty"
            type="number"
            min={1}
            step={1}
            defaultValue={product?.minOrderQty ?? 1}
          />
        </Field>
        <Field label="Order in steps of" name="stepQty">
          <Input
            name="stepQty"
            type="number"
            min={1}
            step={1}
            defaultValue={product?.stepQty ?? 1}
          />
        </Field>
        <Field label="Shelf life in days (optional)" name="shelfLifeDays">
          <Input
            name="shelfLifeDays"
            type="number"
            min={0}
            step={1}
            defaultValue={product?.shelfLifeDays ?? ""}
          />
        </Field>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm sm:min-h-10">
          {/* Unticked boxes post nothing; this empty value is read when the box is clear. */}
          <input type="hidden" name="hazmat" value="" />
          <input type="checkbox" name="hazmat" value="on" defaultChecked={product?.hazmat} />
          Hazardous goods
        </label>
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
