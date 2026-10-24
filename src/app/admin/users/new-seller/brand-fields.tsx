"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui";

/** "Luxury brand" and, when ticked, the brand's website (2026-10-24). */
export function BrandFields() {
  const [brand, setBrand] = useState(false);
  return (
    <>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="isBrand"
          checked={brand}
          onChange={(e) => setBrand(e.target.checked)}
          className="size-5 accent-accent"
        />
        Luxury brand
      </label>
      {brand && (
        <Field label="Website" name="website">
          <Input name="website" type="url" placeholder="https://www.brand.lk" required />
        </Field>
      )}
    </>
  );
}
