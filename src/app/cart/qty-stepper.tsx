"use client";

import { useRef, useState } from "react";
import { snapQty } from "@/lib/order-qty";
import { setQtyAction } from "./actions";

const MAX = 999;

/** − qty +: each tap saves straight away; a typed number saves when the field loses focus. */
export function QtyStepper({
  variantId,
  agent,
  qty,
  label,
  minOrderQty = 1,
  stepQty = 1,
}: {
  variantId: string;
  agent: string;
  qty: number;
  label: string;
  /** Order quantity rule (src/lib/order-qty.ts) */
  minOrderQty?: number;
  stepQty?: number;
}) {
  const rule = { minOrderQty, stepQty };
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(String(qty));
  const save = (next: number) => {
    const n = Math.min(MAX, snapQty(next, rule));
    setValue(String(n));
    if (n === qty) return;
    // Let React write the new value into the field before the form is read.
    queueMicrotask(() => form.current?.requestSubmit());
  };
  const step =
    "inline-flex min-h-11 min-w-11 items-center justify-center text-lg font-medium text-ink hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-10 sm:min-w-10";
  const current = Number(value) || qty;

  return (
    <form
      ref={form}
      action={setQtyAction}
      className="inline-flex items-stretch overflow-hidden rounded-lg border border-line bg-paper"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="agent" value={agent} />
      <button
        type="button"
        className={step}
        aria-label={`One less ${label}`}
        disabled={current <= minOrderQty}
        onClick={() => save(current - stepQty)}
      >
        −
      </button>
      <label className="sr-only" htmlFor={`qty-${variantId}`}>
        Quantity of {label}
      </label>
      <input
        id={`qty-${variantId}`}
        name="qty"
        type="number"
        inputMode="numeric"
        min={minOrderQty}
        step={stepQty}
        max={MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const n = Math.trunc(Number(value));
          if (Number.isFinite(n) && n >= 1) save(n);
          else setValue(String(qty));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-12 border-x border-line bg-paper text-center text-base outline-none [appearance:textfield] focus:bg-muted sm:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={step}
        aria-label={`One more ${label}`}
        disabled={current + stepQty > MAX}
        onClick={() => save(current + stepQty)}
      >
        +
      </button>
    </form>
  );
}
