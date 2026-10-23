import { TaxonomyFields } from "@/components/taxonomy-fields";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { formatDate } from "@/lib/format";
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
  retailPrice: { toString(): string } | null;
  lotId: string | null;
};

type LotChoice = { id: string; name: string; receivedAt: Date };

/** The admin's product details form. Factory sellers send stock offers instead (`src/server/offers.ts`). */
export function ProductForm({
  product,
  lots = [],
  lotId,
  offer,
  action = saveProductAction,
}: {
  product?: ProductValues;
  /** Bulk lots to pick from: a product from a lot takes the lot's price (cost + margin). */
  lots?: LotChoice[];
  lotId?: string;
  /** A seller's accepted offer this new product is for: it becomes one of their designs. */
  offer?: { id: string; name: string };
  action?: (prev: AdminState, fd: FormData) => Promise<AdminState>;
}) {
  return (
    <AdminForm action={action} submit={product ? "Save product" : "Create product"}>
      {product && <input type="hidden" name="id" value={product.id} />}
      {offer && <input type="hidden" name="offerId" value={offer.id} />}
      <Field label="Title" name="title">
        <Input name="title" defaultValue={product?.title ?? offer?.name} required />
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
      <Field label="Lot" name="lotId">
        <Select name="lotId" defaultValue={product?.lotId ?? lotId ?? ""}>
          <option value="">None (price below)</option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {formatDate(l.receivedAt)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Our price (LKR, no lot)" name="price">
          <Input name="price" inputMode="decimal" defaultValue={product?.price.toString()} />
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
    </AdminForm>
  );
}
