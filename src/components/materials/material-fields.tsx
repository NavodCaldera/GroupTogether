"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";
import { reviewReasons } from "@/lib/materials/measure";
import type { FiberShare } from "@/lib/materials/types";

export type PickerMaterial = {
  code: string;
  displayName: string;
  construction: string;
  category: string;
  gsm: [number, number] | null;
  fibers: FiberShare[];
};

const CATEGORY: Record<string, string> = {
  WEFT_KNIT: "Knits",
  WARP_KNIT: "Warp knits",
  WOVEN: "Wovens",
  OTHER: "Other",
};

const MAX_FIBERS = 6;

/**
 * The factory's material choice (DEC-022): search the published library, pick one, then the
 * gsm and composition, pre-filled from the library. Figures far from the library need a tick.
 */
export function MaterialFields({
  materials,
  fibers,
  standards,
  current,
}: {
  materials: PickerMaterial[];
  fibers: { code: string; name: string }[];
  standards: { code: string; name: string }[];
  current: { materialCode: string; gsm: number; composition: FiberShare[] } | null;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [code, setCode] = useState(current?.materialCode ?? "");
  const [gsm, setGsm] = useState(current ? String(current.gsm) : "");
  const [rows, setRows] = useState<{ fiber: string; standard: string; pct: string }[]>(
    (current?.composition ?? []).map((f) => ({
      fiber: f.fiber,
      standard: f.standard ?? "",
      pct: String(f.pct),
    })),
  );
  const chosen = materials.find((m) => m.code === code) ?? null;
  const needle = q.trim().toLowerCase();
  const shown = materials.filter(
    (m) =>
      (!cat || m.category === cat) &&
      (!needle ||
        m.displayName.toLowerCase().includes(needle) ||
        m.construction.toLowerCase().includes(needle)),
  );

  function choose(m: PickerMaterial) {
    setCode(m.code);
    setRows(m.fibers.map((f) => ({ fiber: f.fiber, standard: f.standard ?? "", pct: String(f.pct) })));
    if (!gsm && m.gsm) setGsm(String(Math.round((m.gsm[0] + m.gsm[1]) / 2)));
  }

  const n = Number(gsm);
  const composition = rows
    .filter((r) => r.fiber && Number(r.pct) > 0)
    .map((r) => ({ fiber: r.fiber, standard: r.standard || null, pct: Number(r.pct) }));
  const reasons =
    chosen && Number.isInteger(n) && n > 0
      ? reviewReasons(n, chosen.gsm, composition, chosen.fibers)
      : [];
  const sum = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const set = (i: number, k: "fiber" | "standard" | "pct", v: string) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          type="search"
          aria-label="Search materials"
          placeholder="Search materials"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select aria-label="Fabric type" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All</option>
          {[...new Set(materials.map((m) => m.category))].map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c] ?? c}
            </option>
          ))}
        </Select>
      </div>
      <fieldset className="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-line">
        <legend className="sr-only">Material</legend>
        {shown.map((m) => (
          <label
            key={m.code}
            className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-line px-3 py-1 text-sm last:border-b-0"
          >
            <input
              type="radio"
              name="material"
              value={m.code}
              checked={code === m.code}
              onChange={() => choose(m)}
            />
            <span className="min-w-0 flex-1">
              {m.displayName}
              <span className="block text-xs text-subtle">
                {m.construction}
                {m.gsm && ` · ${m.gsm[0]}–${m.gsm[1]} gsm`}
              </span>
            </span>
          </label>
        ))}
        {!shown.length && <p className="px-3 py-2 text-sm text-subtle">No match</p>}
      </fieldset>

      {chosen && (
        <>
          <Field label="GSM" name="gsm">
            <Input
              name="gsm"
              inputMode="numeric"
              value={gsm}
              onChange={(e) => setGsm(e.target.value)}
              required
            />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-bold">Composition ({sum}%)</legend>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_1fr_5rem]">
                <Select
                  name={`fiber.${i}`}
                  aria-label={`Fibre ${i + 1}`}
                  value={r.fiber}
                  onChange={(e) => set(i, "fiber", e.target.value)}
                >
                  <option value="">—</option>
                  {fibers.map((f) => (
                    <option key={f.code} value={f.code}>
                      {f.name}
                    </option>
                  ))}
                </Select>
                <Select
                  name={`standard.${i}`}
                  aria-label={`Fibre ${i + 1} standard`}
                  value={r.standard}
                  onChange={(e) => set(i, "standard", e.target.value)}
                  className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto"
                >
                  <option value="">No standard</option>
                  {standards.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Input
                  name={`pct.${i}`}
                  inputMode="numeric"
                  aria-label={`Fibre ${i + 1} %`}
                  value={r.pct}
                  onChange={(e) => set(i, "pct", e.target.value)}
                  className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                />
              </div>
            ))}
            {rows.length < MAX_FIBERS && (
              <button
                type="button"
                onClick={() => setRows([...rows, { fiber: "", standard: "", pct: "" }])}
                className="inline-flex min-h-11 items-center self-start text-sm font-medium text-accent underline sm:min-h-10"
              >
                Add fibre
              </button>
            )}
          </fieldset>
          {reasons.length > 0 && (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input type="checkbox" name="confirmRange" className="mt-1" />
              <span>{reasons.join("; ")}. I confirm these figures.</span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
