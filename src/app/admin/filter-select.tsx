"use client";

import { Select } from "@/components/ui";

/**
 * The phone version of a row of filter chips: one native dropdown (the phone's own picker) in a
 * GET form. Picking an option applies it at once; without JavaScript an Apply button shows.
 * Hidden from `sm` up, where the chips are shown instead.
 */
export function FilterSelect({
  action,
  name,
  label,
  value,
  options,
  keep = {},
}: {
  action: string;
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form action={action} className="mb-4 flex gap-2 sm:hidden">
      {Object.entries(keep).map(
        ([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />,
      )}
      <Select
        name={name}
        defaultValue={value ?? ""}
        aria-label={label}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="min-w-0 flex-1"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <noscript>
        <button className="min-h-11 rounded-lg border border-line px-4 text-sm">Apply</button>
      </noscript>
    </form>
  );
}
