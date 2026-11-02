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
  brandUrl: string | null;
  lotId: string | null;
};

type LotChoice = { id: string; name: string; receivedAt: Date };

/** Product details: the admin's form, and a factory's own listing with `factory` (2026-11-03). */
export function ProductForm({
  product,
  lots = [],
  lotId,
  offer,
  action = saveProductAction,
  factory,
}: {
  /** A factory's own listing: its own price and brand, no lot or brand link. */
  factory?: { brand: string };
  product?: ProductValues;
  /** Bulk lots to pick from: a product from a lot takes the lot's price (cost + margin). */
  lots?: LotChoice[];
  lotId?: string;
  /** A seller's accepted offer this new product is for: it becomes one of their designs. A
   * luxury brand's offer also fills the actual price and the link to the brand's page. */
  offer?: { id: string; name: string; actualPrice?: string; productUrl?: string };
  action?: (prev: AdminState, fd: FormData) => Promise<AdminState>;
}) {
  return (
    <AdminForm
      action={action}
      submit={product ? "Save product" : factory ? "Publish" : "Create product"}
    >
      {product && <input type="hidden" name="id" value={product.id} />}
      {offer && <input type="hidden" name="offerId" value={offer.id} />}
      <Field label="Title" name="title">
        <Input name="title" defaultValue={product?.title ?? offer?.name} required />
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
      {!factory && (
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
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={factory ? "Price (LKR)" : "Our price (LKR, no lot)"} name="price">
          <Input
            name="price"
            inputMode="decimal"
            defaultValue={product?.price.toString()}
            required={!!factory}
          />
        </Field>
        <Field label="Retail price (LKR, optional)" name="retailPrice">
          <Input
            name="retailPrice"
            inputMode="decimal"
            defaultValue={product?.retailPrice?.toString() ?? offer?.actualPrice ?? ""}
          />
        </Field>
      </div>
      {!factory && (
        <Field label="Brand link (optional)" name="brandUrl">
          <Input
            name="brandUrl"
            type="url"
            placeholder="https://"
            defaultValue={product?.brandUrl ?? offer?.productUrl ?? ""}
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
