"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { buyerPrice } from "@/lib/price-rules";
import { formatLKR } from "@/lib/format";
export function FactoryPriceInput({
  initial = "",
  commission,
}: {
  initial?: string;
  commission: string;
}) {
  const [price, setPrice] = useState(initial);
  let buyer = "�";
  try {
    buyer = formatLKR(buyerPrice(price, commission));
  } catch {}
  return (
    <div className="flex min-w-0 flex-col gap-2">
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
