"use client";

import { useState } from "react";
import type { CategoryGroup } from "@/lib/categories";

type Props = {
  /** Leaf categories from the tree, grouped under their parents (src/server/categories.ts). */
  groups: CategoryGroup[];
  /** The chosen category: an id in the product form, a slug in the shop. */
  category?: string | null;
  size?: string | null;
  /** Shop filter: the category is optional, posted as `category`, and a size box follows. */
  withSize?: boolean;
  selectClass: string;
};

/**
 * A category from the tree, then (in the shop) a size that follows it. The size box stays disabled
 * until a category is chosen. Plain named selects, so the surrounding GET/POST form needs nothing else.
 */
export function TaxonomyFields({ groups, category, size, withSize = false, selectClass }: Props) {
  const all = groups.flatMap((g) => g.options);
  const [c, setC] = useState(category && all.some((o) => o.value === category) ? category : "");
  const sizes = all.find((o) => o.value === c)?.sizes ?? [];
  const optional = withSize;
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
      {withSize && (
        <select
          // Remount when the list changes so a stale size is dropped.
          key={c || "all"}
          name="size"
          defaultValue={size && sizes.includes(size) ? size : ""}
          disabled={!c || sizes.length === 0}
          aria-label="Size"
          className={selectClass}
        >
          <option value="">{c ? "Any size" : "Choose category first"}</option>
          {sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      )}
    </>
  );
}
