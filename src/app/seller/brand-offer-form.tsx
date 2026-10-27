"use client";

import { type FormEvent, startTransition, useActionState, useState, useEffect } from "react";
import { discountPct } from "@/lib/brand-rules";
import { formatLKR } from "@/lib/format";
import { toD } from "@/lib/decimal";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { type SellerState, sendBrandOfferAction } from "@/server/seller-actions";

/**
 * A luxury brand publishes a discounted product (product owner, 2026-10-24): its name and details,
 * the actual price, the discount price a piece we buy at, the pieces and the link to it on the
 * brand's website. Submitted by hand so a refused send keeps what was typed.
 */
type Defaults = {
  id: string;
  revision: number;
  name: string;
  description: string;
  actualPrice: string;
  offerPrice: string;
  pieces: number;
  productUrl: string;
  photoKey: string | null;
  packDetails: string | null;
  packSize: string | null;
  dispatchDays: number | null;
  hasExpiry: boolean;
  expiryDate: string;
  minShelfLifeDays: number | null;
};
export function BrandOfferForm({
  website,
  defaults,
}: {
  website: string | null;
  defaults?: Defaults;
}) {
  const [state, run, pending] = useActionState<SellerState, FormData>(sendBrandOfferAction, {});
  const [retail, setRetail] = useState(defaults?.actualPrice ?? "");
  const [partner, setPartner] = useState(defaults?.offerPrice ?? "");
  const [hasExpiry, setHasExpiry] = useState(defaults?.hasExpiry ?? false);
  const [preview, setPreview] = useState(
    defaults?.photoKey ? `/api/brand-photos/${defaults.id}?revision=${defaults.revision}` : "",
  );
  const [photoError, setPhotoError] = useState("");
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const cleanRetail = retail.replace(/,/g, "");
  const cleanPartner = partner.replace(/,/g, "");
  const discount =
    /^\d+(\.\d{1,2})?$/.test(cleanRetail) &&
    /^\d+(\.\d{1,2})?$/.test(cleanPartner) &&
    toD(cleanPartner).gt(0)
      ? discountPct(cleanRetail, cleanPartner)
      : null;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {defaults && <input type="hidden" name="offerId" value={defaults.id} />}
      {defaults && <input type="hidden" name="revision" value={defaults.revision} />}
      <Field label="Product name" name="name">
        <Input
          name="name"
          maxLength={120}
          defaultValue={defaults?.name}
          placeholder="e.g. Signature care gift set"
          required
        />
      </Field>
      <Field
        label={defaults?.photoKey ? "Product photo (replace optional)" : "Product photo"}
        name="photo"
        hint="JPG, PNG or WebP · Up to 5 MB"
      >
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Gift product preview"
            width={240}
            height={160}
            className="h-40 w-full rounded-lg border border-line bg-muted object-contain"
          />
        )}
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required={!defaults?.photoKey}
          className="min-h-11 w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPhotoError("");
            if (!file) {
              setPreview(defaults?.photoKey ? `/api/brand-photos/${defaults.id}` : "");
              return;
            }
            if (
              !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
              file.size > 5 * 1024 * 1024
            ) {
              setPhotoError("Choose a JPG, PNG or WebP photo up to 5 MB.");
              e.target.value = "";
              setPreview(defaults?.photoKey ? `/api/brand-photos/${defaults.id}` : "");
              return;
            }
            setPreview(URL.createObjectURL(file));
          }}
        />
      </Field>
      {photoError && <Alert>{photoError}</Alert>}
      <Field label="Gift contents" name="packDetails">
        <Textarea
          name="packDetails"
          rows={2}
          maxLength={1000}
          defaultValue={defaults?.packDetails ?? ""}
          placeholder="e.g. One hand cream and one body lotion in a gift box"
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Size / weight / volume" name="packSize">
          <Input
            name="packSize"
            maxLength={120}
            placeholder="e.g. 2 × 100 ml"
            defaultValue={defaults?.packSize ?? ""}
            required
          />
        </Field>
        <Field label="Dispatch within (business days)" name="dispatchDays">
          <Input
            name="dispatchDays"
            type="number"
            min={1}
            max={365}
            placeholder="e.g. 2"
            defaultValue={defaults?.dispatchDays ?? ""}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Retail value (LKR)" name="actualPrice">
          <Input
            name="actualPrice"
            inputMode="decimal"
            placeholder="e.g. 5,000"
            value={retail}
            onChange={(e) => setRetail(e.target.value)}
            required
          />
        </Field>
        <Field label="GroupBasket partner price (LKR)" name="offerPrice">
          <Input
            name="offerPrice"
            inputMode="decimal"
            placeholder="e.g. 3,500"
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            required
          />
        </Field>
      </div>
      {discount !== null && (
        <output
          aria-live="polite"
          className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent"
        >
          {discount}% partner discount · GroupBasket pays {formatLKR(cleanPartner)} per gift
        </output>
      )}
      <Field label="Quantity available for gifts" name="pieces">
        <Input
          name="pieces"
          type="number"
          min={1}
          max={100000}
          defaultValue={defaults?.pieces}
          placeholder="e.g. 40"
          required
        />
      </Field>
      <Field label="Link on your website" name="productUrl">
        <Input
          name="productUrl"
          type="url"
          placeholder={
            website
              ? `e.g. ${website.replace(/\/$/, "")}/products/gift-set`
              : "e.g. https://brand.lk/products/gift-set"
          }
          defaultValue={defaults?.productUrl}
          required
        />
      </Field>
      <Field label="Description (optional)" name="description">
        <Textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={defaults?.description}
        />
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="hasExpiry"
          checked={hasExpiry}
          onChange={(e) => setHasExpiry(e.target.checked)}
          className="size-4 accent-accent"
        />
        This product has an expiry or shelf life
      </label>
      {hasExpiry && (
        <div className="grid gap-4 rounded-lg border border-line p-3 sm:grid-cols-2">
          <Field label="Expiry date (if known)" name="expiryDate">
            <Input name="expiryDate" type="date" defaultValue={defaults?.expiryDate} />
          </Field>
          <Field label="Minimum shelf life on delivery (days)" name="minShelfLifeDays">
            <Input
              name="minShelfLifeDays"
              type="number"
              min={1}
              max={3650}
              placeholder="e.g. 180"
              defaultValue={defaults?.minShelfLifeDays ?? ""}
            />
          </Field>
        </div>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send for review"}
      </Button>
    </form>
  );
}
