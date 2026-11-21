"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Toast } from "@/components/toast";
import { Alert, Button, Field, Input } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { type AddState, addToCartAction } from "./actions";

type Variant = { id: string; options: Record<string, string>; available: number };
/** One option the buyer picks (size, colour, pages …), values in display order. */
type Axis = { key: string; name: string; values: string[] };

const chip = (out: boolean) =>
  `inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent has-focus-visible:ring-2 has-focus-visible:ring-ink/30 sm:min-h-10 ${
    out ? "border-line text-subtle" : "border-line"
  }`;

const matches = (v: Variant, picked: Record<string, string>) =>
  Object.entries(picked).every(([k, value]) => v.options[k] === value);

/** The variant after picking `key = value`: the same other choices if that one exists, else the
 * first one in stock with that value. */
function pick(variants: Variant[], current: Variant | undefined, key: string, value: string) {
  const want = { ...(current?.options ?? {}), [key]: value };
  return (
    variants.find((v) => matches(v, want)) ??
    variants.find((v) => v.options[key] === value && v.available > 0) ??
    variants.find((v) => v.options[key] === value)
  );
}

/** One group of chips per option; the chosen variant is the one matching every group. */
function OptionPicker({
  axes,
  variants,
  current,
  onPick,
}: {
  axes: Axis[];
  variants: Variant[];
  current: Variant | undefined;
  onPick: (id: string) => void;
}) {
  return axes.map((axis) => {
    const others = Object.fromEntries(
      Object.entries(current?.options ?? {}).filter(([k]) => k !== axis.key),
    );
    return (
      <fieldset key={axis.key}>
        <legend className="mb-1.5 text-sm font-bold">{axis.name}</legend>
        <div className="flex flex-wrap gap-2">
          {axis.values.map((value) => {
            const inStock = variants.some(
              (v) => v.options[axis.key] === value && matches(v, others) && v.available > 0,
            );
            return (
              <label key={value} className={chip(!inStock)}>
                <input
                  type="radio"
                  name={`option.${axis.key}`}
                  value={value}
                  checked={current?.options[axis.key] === value}
                  onChange={() => {
                    const next = pick(variants, current, axis.key, value);
                    if (next) onPick(next.id);
                  }}
                  className="sr-only"
                />
                {value}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  });
}

export function AddToCartForm({
  price,
  variants,
  axes,
  cartHref,
}: {
  /** Unit price as a decimal string (never a JS number) */
  price: string;
  variants: Variant[];
  axes: Axis[];
  cartHref: string;
}) {
  const [state, action, pending] = useActionState<AddState, FormData>(addToCartAction, {});
  const [variantId, setVariantId] = useState(variants.find((v) => v.available > 0)?.id ?? "");
  const current = variants.find((v) => v.id === variantId);
  const max = current?.available ?? 0;
  const [qty, setQty] = useState("1");
  const count = /^\d+$/.test(qty) ? Number(qty) : 0;
  const total = new D(price).mul(count);

  if (!variants.some((v) => v.available > 0))
    return <p className="text-sm font-medium text-danger">Sold out.</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && !pending && (
        <Toast key={state.at}>
          <span>✓ {state.ok}</span>
          <Link href={cartHref} className="text-accent underline">
            View cart
          </Link>
        </Toast>
      )}
      <input type="hidden" name="variantId" value={current?.id ?? ""} />
      <OptionPicker axes={axes} variants={variants} current={current} onPick={setVariantId} />
      <p className={`-mt-2 text-sm font-medium ${max <= 5 ? "text-danger" : "text-accent"}`}>
        {max === 0 ? "Sold" : `${max.toLocaleString("en-LK")} left in stock`}
      </p>
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
      <Button type="submit" disabled={pending || !variantId || max === 0}>
        {pending ? "Adding…" : "Add to cart"}
      </Button>
    </form>
  );
}
/** Signed-out view: pick options to see how many are left. */
export function SizeStockPreview({ variants, axes }: { variants: Variant[]; axes: Axis[] }) {
  const [id, setId] = useState(variants.find((v) => v.available > 0)?.id ?? variants[0]?.id ?? "");
  const current = variants.find((v) => v.id === id);
  const left = current?.available ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <OptionPicker axes={axes} variants={variants} current={current} onPick={setId} />
      <p className={`-mt-2 text-sm font-medium ${left <= 5 ? "text-danger" : "text-accent"}`}>
        {left === 0 ? "Sold" : `${left.toLocaleString("en-LK")} left in stock`}
      </p>
    </div>
  );
}
