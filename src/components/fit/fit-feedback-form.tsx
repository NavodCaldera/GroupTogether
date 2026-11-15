"use client";

import { useActionState } from "react";
import { Alert, Button, cx } from "@/components/ui";
import { REGION_LABEL, type Region } from "@/lib/fit/regions";
import type { FitState } from "@/server/fit-actions";

const VERDICTS = [
  { id: "TOO_TIGHT", label: "Too tight" },
  { id: "GOOD", label: "Good" },
  { id: "TOO_LOOSE", label: "Too loose" },
] as const;

/** "How did it fit?" for one collected line (DEC-020); areas are optional. */
export function FitFeedbackForm({
  lineId,
  title,
  size,
  regions,
  action,
}: {
  lineId: string;
  title: string;
  size: string;
  regions: Region[];
  action: (prev: FitState, fd: FormData) => Promise<FitState>;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form
      action={run}
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-3 first:border-0 first:pt-0"
    >
      <h3 className="font-semibold">
        {title} · {size}
      </h3>
      <input type="hidden" name="orderLineId" value={lineId} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Overall</legend>
        {VERDICTS.map((v) => (
          <label
            key={v.id}
            className={cx(
              "inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper sm:min-h-10",
            )}
          >
            <input type="radio" name="verdict" value={v.id} required className="sr-only" />
            {v.label}
          </label>
        ))}
      </fieldset>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium sm:min-h-10">
          By area
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {regions.map((r) => (
            <label key={r} className="flex flex-col gap-1 text-sm">
              {REGION_LABEL[r]}
              <select
                name={`region.${r}`}
                className="min-h-11 rounded-lg border border-line bg-paper px-2 text-base sm:min-h-10 sm:text-sm"
                defaultValue=""
              >
                <option value="">—</option>
                {VERDICTS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </details>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Working…" : "Send"}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
