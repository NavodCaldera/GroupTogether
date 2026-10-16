"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { type ActionState, addToCartAction } from "@/server/carts/actions";
import { VisibilityChoice } from "../../carts/new/new-cart-form";

type Variant = { id: string; label: string; available: number };
type CartOption = { id: string; code: string; label: string };

export function AddToCartForm({
  productId,
  variants,
  carts,
  preselect,
}: {
  productId: string;
  variants: Variant[];
  carts: CartOption[];
  preselect?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addToCartAction, {});
  const [target, setTarget] = useState(preselect ?? carts[0]?.id ?? "new");
  const [variantId, setVariantId] = useState(variants.find((v) => v.available > 0)?.id ?? "");
  const max = variants.find((v) => v.id === variantId)?.available ?? 0;

  if (!variants.some((v) => v.available > 0))
    return <p className="text-sm font-medium text-danger">Sold out in every size.</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Size</legend>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => (
            <label
              key={v.id}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm has-checked:border-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30 sm:min-h-10 has-checked:bg-accent has-checked:text-on-accent ${
                v.available === 0 ? "cursor-not-allowed opacity-40 line-through" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="variantId"
                value={v.id}
                disabled={v.available === 0}
                checked={variantId === v.id}
                onChange={() => setVariantId(v.id)}
                className="sr-only"
              />
              {v.label}
            </label>
          ))}
        </div>
        <p className={`mt-2 text-sm font-medium ${max <= 5 ? "text-warn" : "text-accent"}`}>
          {max.toLocaleString("en-LK")} left in stock
        </p>
      </fieldset>
      <Field label="Quantity" name="qty">
        <Input
          name="qty"
          type="number"
          min={1}
          max={Math.max(1, Math.min(99, max))}
          defaultValue={1}
          className="w-24"
        />
      </Field>
      <Field label="Add to" name="cartId">
        <Select name="cartId" value={target} onChange={(e) => setTarget(e.target.value)}>
          {carts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.code})
            </option>
          ))}
          <option value="new">+ Start a new cart</option>
        </Select>
      </Field>
      {target === "new" && (
        <>
          <Field label="New cart name (optional)" name="name">
            <Input name="name" maxLength={60} />
          </Field>
          <VisibilityChoice />
        </>
      )}
      <Button type="submit" disabled={pending || !variantId}>
        {pending ? "Adding…" : "Add to group cart"}
      </Button>
    </form>
  );
}

/** Signed-out view: pick a size to see how many are left. */
export function SizeStockPreview({ variants }: { variants: Variant[] }) {
  const [id, setId] = useState(variants.find((v) => v.available > 0)?.id ?? variants[0]?.id ?? "");
  const left = variants.find((v) => v.id === id)?.available ?? 0;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-bold">Size</legend>
      <div className="flex flex-wrap gap-2">
        {variants.map((v) => (
          <label
            key={v.id}
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30 sm:min-h-10 ${
              v.available === 0 ? "line-through opacity-40" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="size"
              checked={id === v.id}
              onChange={() => setId(v.id)}
              className="sr-only"
            />
            {v.label}
          </label>
        ))}
      </div>
      <p
        className={`mt-2 text-sm font-medium ${left === 0 ? "text-danger" : left <= 5 ? "text-warn" : "text-accent"}`}
      >
        {left === 0 ? "Sold out" : `${left.toLocaleString("en-LK")} left in stock`}
      </p>
    </fieldset>
  );
}
