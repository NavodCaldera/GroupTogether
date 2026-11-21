/**
 * A row of steps: done steps filled, later ones muted. `fill` (0 to 1) fills the current step
 * only part way, so one bar shows both the stage and how full the basket is (owner, 2026-11-21:
 * no second bar). `dates` puts each finished step's date under its label.
 */
export function StepTrack({
  steps,
  step,
  label,
  fill,
  fillLabel = "Basket progress",
  dates,
}: {
  steps: readonly string[];
  step: number;
  label: string;
  fill?: number | null;
  fillLabel?: string;
  dates?: readonly (string | null | undefined)[];
}) {
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={label}
    >
      {steps.map((s, i) => {
        const partial = i === step && fill != null;
        const pct = partial ? Math.max(4, Math.min(100, Math.round(fill * 100))) : 0;
        return (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className="flex min-w-0 flex-col gap-1.5"
          >
            {partial ? (
              <span
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={fillLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.round(fill * 100))}
              >
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </span>
            ) : (
              <span
                className={`h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`}
                aria-hidden
              />
            )}
            <span className={`text-xs ${i === step ? "font-semibold text-ink" : "text-subtle"}`}>
              {s}
              <span className="sr-only">{i < step ? " (done)" : i === step ? " (now)" : ""}</span>
            </span>
            {dates?.[i] && i <= step && (
              <span className="-mt-1 text-xs text-subtle tabular-nums">{dates[i]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
