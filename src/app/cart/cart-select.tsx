"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { formatLKR } from "@/lib/format";

/** The ticked cart items, read from the checkboxes of the selection form (they sit in the rows,
 * outside the form, linked by its id). */
export type Picked = { ids: string[]; factories: number; cents: number; all: number };

function read(formId: string): Picked {
  const boxes = document.querySelectorAll<HTMLInputElement>(
    `input[type=checkbox][name=sel][form="${formId}"]`,
  );
  const open = [...boxes].filter((b) => !b.disabled);
  const on = open.filter((b) => b.checked);
  return {
    all: open.length,
    ids: on.map((b) => b.value),
    factories: new Set(on.map((b) => b.dataset.factory)).size,
    cents: on.reduce((s, b) => s + Number(b.dataset.cents ?? 0), 0),
  };
}

function usePicked(formId: string, initial: Picked) {
  const [picked, setPicked] = useState(initial);
  useEffect(() => {
    const update = () => setPicked(read(formId));
    const onChange = (e: Event) => {
      if ((e.target as HTMLInputElement | null)?.getAttribute("form") === formId) update();
    };
    update();
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [formId]);
  return picked;
}

/** Ticks or unticks every item that can be bought. */
export function SelectAll({ formId, initial }: { formId: string; initial: Picked }) {
  const picked = usePicked(formId, initial);
  const n = picked.ids.length;
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 font-medium">
      <input
        type="checkbox"
        className="h-5 w-5 accent-(--accent)"
        checked={picked.all > 0 && n === picked.all}
        ref={(el) => {
          if (el) el.indeterminate = n > 0 && n < picked.all;
        }}
        onChange={(e) => {
          const on = e.currentTarget.checked;
          const boxes = document.querySelectorAll<HTMLInputElement>(
            `input[type=checkbox][name=sel][form="${formId}"]:not(:disabled)`,
          );
          boxes.forEach((b) => {
            b.checked = on;
          });
          boxes[0]?.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      />
      Select all
    </label>
  );
}

const HOW = [
  ["agent", "Agent pickup"],
  ["mine", "My basket"],
  ["join", "Join a basket"],
] as const;

/** "Get the N selected by" and the three ways. The baskets need items of one factory. While the
 * ticks differ from what the panel below was opened for, the panel is hidden. */
export function Choices({
  formId,
  how,
  initial,
  shown,
  panelId,
}: {
  formId: string;
  how: string | null;
  initial: Picked;
  /** The items the open panel is for. */
  shown: string[];
  panelId: string;
}) {
  const picked = usePicked(formId, initial);
  const same = picked.ids.length === shown.length && picked.ids.every((id) => shown.includes(id));
  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = !same;
  }, [same, panelId]);
  const n = picked.ids.length;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 text-lg font-semibold">
        <span>Get the {n} selected by</span>
        {n > 0 && (
          <span className="text-base tabular-nums">
            {formatLKR((picked.cents / 100).toFixed(2))}
          </span>
        )}
      </h2>
      <div className="grid grid-cols-3 gap-2">
        {HOW.map(([value, label]) => {
          const disabled = n === 0 || (value !== "agent" && picked.factories !== 1);
          const current = same && how === value;
          return (
            <button
              key={value}
              type="submit"
              form={formId}
              name="how"
              value={value}
              disabled={disabled}
              aria-pressed={current}
              className={cx(
                "inline-flex min-h-11 items-center justify-center rounded-lg border px-2 text-center text-sm font-medium leading-tight disabled:cursor-not-allowed disabled:opacity-40",
                current
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-paper hover:bg-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
