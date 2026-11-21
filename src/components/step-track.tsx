/** A row of steps with the current one marked: done steps filled, later ones muted. */
export function StepTrack({
  steps,
  step,
  label,
}: {
  steps: readonly string[];
  step: number;
  label: string;
}) {
  return (
    <ol
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={label}
    >
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          className="flex flex-col gap-1.5"
        >
          <span
            className={`h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`}
            aria-hidden
          />
          <span className={`text-xs ${i === step ? "font-semibold text-ink" : "text-subtle"}`}>
            {s}
            <span className="sr-only">{i < step ? " (done)" : i === step ? " (now)" : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A thin fill bar, 0 to 1. */
export function FillBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}
