"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Toast } from "@/components/toast";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { type ActionState, addToCartAction } from "@/server/carts/actions";
import { VisibilityChoice } from "../../carts/new/new-cart-form";

type Variant = { id: string; label: string; available: number };
type CartOption = { id: string; code: string; label: string };

export function AddToCartForm({
  productId,
  price,
  variants,
  carts,
  preselect,
}: {
  productId: string;
  /** Unit price as a decimal string (never a JS number) */
  price: string;
  variants: Variant[];
  carts: CartOption[];
  preselect?: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addToCartAction, {});
  const [picked, setPicked] = useState(preselect ?? carts[0]?.id ?? "new");
  // After the first add starts a cart, the list gains it: fall back to it instead of "new".
  const target = carts.some((c) => c.id === picked) ? picked : (carts[0]?.id ?? "new");
  const [variantId, setVariantId] = useState(variants.find((v) => v.available > 0)?.id ?? "");
  const max = variants.find((v) => v.id === variantId)?.available ?? 0;
  const [qty, setQty] = useState("1");
  const count = /^\d+$/.test(qty) ? Number(qty) : 0;
  const total = new D(price).mul(count);

  if (!variants.some((v) => v.available > 0))
    return <p className="text-sm font-medium text-danger">Sold out in every size.</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && !pending && (
        <Toast key={state.at}>
          <span>✓ {state.ok}</span>
          <Link href={`/c/${state.code}`} className="text-accent underline">
            View cart
          </Link>
        </Toast>
      )}
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Size</legend>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => (
            <label
              key={v.id}
              className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm has-checked:border-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30 sm:min-h-10 has-checked:bg-accent has-checked:text-on-accent ${
                v.available === 0 ? "border-line text-subtle" : "border-line"
              }`}
            >
              <input
                type="radio"
                name="variantId"
                value={v.id}
                checked={variantId === v.id}
                onChange={() => setVariantId(v.id)}
                className="sr-only"
              />
              {v.label}
            </label>
          ))}
        </div>
        <p className={`mt-2 text-sm font-medium ${max <= 5 ? "text-danger" : "text-accent"}`}>
          {max === 0 ? "Sold" : `${max.toLocaleString("en-LK")} left in stock`}
        </p>
      </fieldset>
      <div className="flex items-start gap-3">
        <Field label="Quantity" name="qty">
          <Input
            name="qty"
            type="number"
            min={1}
            max={Math.max(1, Math.min(99, max))}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-24"
          />
        </Field>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold">Total</span>
          <output
            htmlFor="qty"
            aria-live="polite"
            className="flex min-h-11 items-center rounded-lg border border-line bg-muted px-3 font-semibold tabular-nums sm:min-h-10"
          >
            {formatLKR(total)}
          </output>
        </div>
      </div>
      <Field label="Add to" name="cartId">
        <Select name="cartId" value={target} onChange={(e) => setPicked(e.target.value)}>
          {carts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
          {carts.length === 0 && <option value="new">+ Start a new cart</option>}
        </Select>
      </Field>
      {target === "new" && <VisibilityChoice />}
      <Button type="submit" disabled={pending || !variantId || max === 0}>
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
              v.available === 0 ? "border-line text-subtle" : "border-line"
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
        className={`mt-2 text-sm font-medium ${left === 0 ? "text-danger" : left <= 5 ? "text-danger" : "text-accent"}`}
      >
        {left === 0 ? "Sold" : `${left.toLocaleString("en-LK")} left in stock`}
      </p>
    </fieldset>
  );
}
