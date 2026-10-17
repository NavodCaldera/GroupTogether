"use client";

import { useState } from "react";
import { AUDIENCES, type Audience, isAudience, kindFits, kindsFor, sizesFor } from "@/lib/taxonomy";

type Props = {
  audience?: string | null;
  kind?: string | null;
  size?: string | null;
  /** Shop filter: every choice is optional and a size box follows. */
  withSize?: boolean;
  selectClass: string;
};

/**
 * Audience, then a category that follows it, then (in the shop) a size that follows the category.
 * Each box stays disabled until the one before it has a choice.
 * Plain named selects, so the surrounding GET/POST form needs nothing else.
 */
export function TaxonomyFields({ audience, kind, size, withSize = false, selectClass }: Props) {
  const [a, setA] = useState<Audience | "">(isAudience(audience) ? audience : "");
  const [k, setK] = useState(
    audience && kind && isAudience(audience) && kindFits(audience, kind) ? kind : "",
  );
  const kinds = kindsFor(a);
  const sizes = sizesFor(k);
  const optional = withSize;
  return (
    <>
      <select
        name="audience"
        value={a}
        required={!optional}
        aria-label="Audience"
        className={selectClass}
        onChange={(e) => {
          const v = e.target.value as Audience | "";
          setA(v);
          if (!v || (k && !kindFits(v, k))) setK("");
        }}
      >
        <option value="">{optional ? "Audience" : "Choose…"}</option>
        {AUDIENCES.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <select
        name="kind"
        value={k}
        disabled={!a}
        required={!optional}
        aria-label="Category"
        className={selectClass}
        onChange={(e) => setK(e.target.value)}
      >
        <option value="">
          {a ? (optional ? "All categories" : "Choose…") : "Choose audience first"}
        </option>
        {kinds.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      {withSize && (
        <select
          // Remount when the list changes so a stale size is dropped.
          key={k || "all"}
          name="size"
          defaultValue={size && sizes.includes(size) ? size : ""}
          disabled={!k}
          aria-label="Size"
          className={selectClass}
        >
          <option value="">{k ? "Any size" : "Choose category first"}</option>
          {sizes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      )}
    </>
  );
}
