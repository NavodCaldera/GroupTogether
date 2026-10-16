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
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent ${
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
        {max > 0 && max <= 5 && <p className="mt-1 text-xs text-warn">Only {max} left</p>}
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
