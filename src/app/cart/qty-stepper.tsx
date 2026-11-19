"use client";

import { useRef, useState } from "react";
import { setQtyAction } from "./actions";

const MAX = 999;

/** − qty +: each tap saves straight away; a typed number saves when the field loses focus. */
export function QtyStepper({
  variantId,
  agent,
  qty,
  label,
}: {
  variantId: string;
  agent: string;
  qty: number;
  label: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(String(qty));
  const save = (next: number) => {
    const n = Math.min(MAX, Math.max(1, next));
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
        disabled={current <= 1}
        onClick={() => save(current - 1)}
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
        min={1}
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
        disabled={current >= MAX}
        onClick={() => save(current + 1)}
      >
        +
      </button>
    </form>
  );
}
