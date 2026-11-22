"use client";

import { useState } from "react";
import type { CategoryGroup, ChoiceAttribute } from "@/lib/categories";

type SpecValue = string | number | boolean;

type Props = {
  /** Leaf categories from the tree, grouped under their parents (src/server/categories.ts). */
  groups: CategoryGroup[];
  /** The chosen category: an id in the product form, a slug in the shop. */
  category?: string | null;
  selectClass: string;
  /**
   * Shop: the category is optional, posted as `category`, and each filterable attribute of the
   * chosen category follows as a select named by its key. `picked` holds the current values;
   * `optionValues` the values in stock for attributes with no fixed list (colour).
   */
  shop?: { picked: Record<string, string>; optionValues: Record<string, string[]> };
  /** Product form: the stored specs; each product-level attribute follows as `spec.<key>`. */
  specs?: Record<string, SpecValue>;
};

/**
 * A category from the tree, then the fields its attributes call for (CATG-002): shop filters, or
 * the product form's spec fields. Plain named inputs, so the surrounding form needs nothing else.
 */
export function TaxonomyFields({ groups, category, selectClass, shop, specs }: Props) {
  const all = groups.flatMap((g) => g.options);
  const [c, setC] = useState(category && all.some((o) => o.value === category) ? category : "");
  const attributes = all.find((o) => o.value === c)?.attributes ?? [];
  const optional = !!shop;
  return (
    <>
      <select
        name={optional ? "category" : "categoryId"}
        value={c}
        required={!optional}
        aria-label="Category"
        className={selectClass}
        onChange={(e) => setC(e.target.value)}
      >
        <option value="">{optional ? "All categories" : "Choose…"}</option>
        {groups.map((g) =>
          g.label ? (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ) : (
            g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          ),
        )}
      </select>
      {shop && (
        // Remount when the category changes so stale filter values are dropped.
        <ShopFilters
          key={c || "all"}
          category={c}
          attributes={attributes}
          picked={shop.picked}
          optionValues={shop.optionValues}
          selectClass={selectClass}
        />
      )}
      {specs && (
        <SpecFields
          key={c || "none"}
          attributes={attributes}
          specs={specs}
          selectClass={selectClass}
        />
      )}
    </>
  );
}

/** Names a shop filter may not take: they are the shop's own parameters. */
const RESERVED = new Set(["q", "brand", "category", "kind", "agent", "condition"]);

/** One select per filterable attribute; before a category is picked, a disabled Size box. */
function ShopFilters({
  category,
  attributes,
  picked,
  optionValues,
  selectClass,
}: {
  category: string;
  attributes: ChoiceAttribute[];
  picked: Record<string, string>;
  optionValues: Record<string, string[]>;
  selectClass: string;
}) {
  if (!category)
    return (
      <select disabled aria-label="Size" className={selectClass} defaultValue="">
        <option value="">Choose category first</option>
      </select>
    );
  return attributes
    .filter((a) => a.filterable && !RESERVED.has(a.key))
    .map((a) => {
      const values = a.values.length
        ? a.values
        : (optionValues[a.key] ?? []).map((v) => ({ value: v, label: v }));
      if (!values.length) return null;
      const current = picked[a.key];
      return (
        <select
          key={a.key}
          name={a.key}
          defaultValue={current && values.some((v) => v.value === current) ? current : ""}
          aria-label={a.label}
          className={selectClass}
        >
          <option value="">{`Any ${a.label.toLowerCase()}`}</option>
          {values.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </select>
      );
    });
}

/** Product-level attributes as form fields, named `spec.<key>`. */
function SpecFields({
  attributes,
  specs,
  selectClass,
}: {
  attributes: ChoiceAttribute[];
  specs: Record<string, SpecValue>;
  selectClass: string;
}) {
  const fields = attributes.filter((a) => !a.isVariantAxis);
  if (!fields.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((a) => {
        const name = `spec.${a.key}`;
        const stored = specs[a.key];
        if (a.type === "BOOL")
          return (
            <label key={a.key} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-10">
              <input type="checkbox" name={name} value="true" defaultChecked={stored === true} />
              {a.label}
            </label>
          );
        const label = `${a.label}${a.unit ? ` (${a.unit})` : ""}${a.required ? "" : " (optional)"}`;
        return (
          <label key={a.key} className="flex flex-col gap-1.5 text-sm font-bold">
            {label}
            {a.type === "ENUM" && a.values.length ? (
              <select
                name={name}
                required={a.required}
                defaultValue={stored === undefined ? "" : String(stored)}
                className={`${selectClass} font-normal`}
              >
                <option value="">Choose…</option>
                {a.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={name}
                required={a.required}
                inputMode={a.type === "NUMBER" ? "decimal" : undefined}
                defaultValue={stored === undefined ? "" : String(stored)}
                className={`${selectClass} font-normal`}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
