"use client";

import { type FormEvent, startTransition, useActionState, useState } from "react";
import { TaxonomyFields } from "@/components/taxonomy-fields";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { sizesFor } from "@/lib/taxonomy";
import { type SellerState, sellerListingAction } from "@/server/seller-actions";

export type ListingValues = {
  id: string;
  title: string;
  brand: string;
  description: string;
  audience: string | null;
  kind: string | null;
  stockType: string;
  price: string;
  retailPrice: string | null;
  hasPhoto: boolean;
};

const selectClass =
  "min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-base outline-none focus:border-ink sm:min-h-10 sm:text-sm";

/**
 * The factory seller's one screen for a product (product owner, 2026-10-19): photo, details and
 * how many they have in each size of the chosen category, then Send for review or Save draft.
 * Submitted by hand so a refused save keeps everything typed.
 */
export function ListingForm({
  product,
  stock = {},
}: {
  product?: ListingValues;
  /** Pieces per size, from the product's sizes without a colour. */
  stock?: Record<string, number>;
}) {
  const [state, run, pending] = useActionState<SellerState, FormData>(sellerListingAction, {});
  const [kind, setKind] = useState(product?.kind ?? "");
  const sizes = sizesFor(kind);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => run(fd));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {product && <input type="hidden" name="id" value={product.id} />}

      <Field label="Photo" name="photo">
        <div className="flex items-center gap-3">
          {product?.hasPhoto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/photos/${product.id}`}
              alt=""
              className="size-14 shrink-0 rounded-lg bg-muted object-cover"
            />
          )}
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-line file:bg-paper file:px-3 file:text-sm file:font-medium file:text-ink"
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="title">
          <Input name="title" defaultValue={product?.title} placeholder="Leather loafer" required />
        </Field>
        <Field label="Brand" name="brand">
          <Input name="brand" defaultValue={product?.brand} required />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Category</span>
        <div className="grid gap-3 sm:grid-cols-2">
          <TaxonomyFields
            audience={product?.audience}
            kind={product?.kind}
            selectClass={selectClass}
            onKind={setKind}
          />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-bold">Condition</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["FACTORY_SURPLUS", "Factory surplus"],
            ["B_GRADE", "B-grade"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line text-sm has-checked:border-accent has-checked:bg-accent/10 has-checked:font-medium"
            >
              <input
                type="radio"
                name="stockType"
                value={value}
                defaultChecked={(product?.stockType ?? "FACTORY_SURPLUS") === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Price (LKR)" name="price">
          <Input name="price" inputMode="decimal" defaultValue={product?.price} required />
        </Field>
        <Field label="Shop price (optional)" name="retailPrice">
          <Input name="retailPrice" inputMode="decimal" defaultValue={product?.retailPrice ?? ""} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">How many do you have?</legend>
        {sizes.length === 0 ? (
          <p className="text-sm text-subtle">Choose the category to see its sizes.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {sizes.map((size) => (
              <label key={`${kind}:${size}`} className="flex flex-col gap-1 text-center text-xs">
                <span className="font-medium">{size}</span>
                <Input
                  name={`qty:${size}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="0"
                  defaultValue={stock[size] || ""}
                  className="text-center"
                />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <Field label="Description (optional)" name="description">
        <Textarea name="description" defaultValue={product?.description} rows={3} />
      </Field>

      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
        <Button type="submit" name="intent" value="send" disabled={pending}>
          {pending ? "Saving…" : "Send for review"}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          Save draft
        </Button>
      </div>
      <p className="text-xs text-subtle">We put it on sale once your stock reaches our store.</p>
    </form>
  );
}
