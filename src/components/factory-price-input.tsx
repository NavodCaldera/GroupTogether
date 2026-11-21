"use client";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { buyerPrice, categoryCommission, type CommissionRate } from "@/lib/price-rules";
import { formatLKR } from "@/lib/format";

/**
 * Factory price with the buyer price beside it. A saved listing passes its snapshotted
 * `commission`; a new one passes the category `rates` and the flat fallback, and follows the
 * form's category select (DEAL-004).
 */
export function FactoryPriceInput({
  initial = "",
  commission,
  rates,
}: {
  initial?: string;
  commission: string;
  rates?: Record<string, CommissionRate>;
}) {
  const [price, setPrice] = useState(initial);
  const [categoryId, setCategoryId] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!rates || !form) return;
    const read = () => {
      const el = form.elements.namedItem("categoryId");
      setCategoryId(el instanceof HTMLSelectElement ? el.value : "");
    };
    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, [rates]);
  let buyer = "—";
  try {
    const rate = rates?.[categoryId];
    const c = rate ? categoryCommission(price, rate, commission).toFixed(2) : commission;
    buyer = formatLKR(buyerPrice(price, c));
  } catch {}
  return (
    <div ref={box} className="flex min-w-0 flex-col gap-2">
      <Field label="Factory price (LKR)" name="price">
        <Input
          name="price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </Field>
      <div className="text-sm">
        <span>Buyer price </span>
        <output aria-label="Buyer price" className="font-semibold">
          {buyer}
        </output>
      </div>
    </div>
  );
}
