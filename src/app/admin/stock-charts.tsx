import { formatDate } from "@/lib/format";

export const pcs = (n: number) => `${n.toLocaleString("en-LK")} ${n === 1 ? "pc" : "pcs"}`;

type Week = { start: Date; in: number; out: number };

/**
 * Pieces per week as columns, one series per chart: "In" and "Out" sit side by side on the same
 * scale (`max`) instead of two colours on one chart. Server-rendered, no JS: each week is a
 * focusable column with a CSS tooltip; "Show as table" gives the numbers. Bars: <= 24px, 4px
 * rounded top, one baseline, `--chart` colour.
 */
export function WeekBars({
  title,
  weeks,
  field,
  max,
}: {
  title: string;
  weeks: Week[];
  field: "in" | "out";
  max: number;
}) {
  const last = weeks.length - 1;
  const label = (w: Week, i: number) => (i === last ? "This week" : `Wk of ${formatDate(w.start)}`);
  const sum = weeks.reduce((n, w) => n + w[field], 0);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-subtle">{pcs(sum)}</span>
      </figcaption>
      <div className="relative">
        <ol className="flex h-28 items-end border-t border-b border-line pt-2">
          {weeks.map((w, i) => {
            const v = w[field];
            const pct = max > 0 ? (v / max) * 100 : 0;
            const tip = i < 2 ? "left-0" : i > last - 2 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <li
                key={w.start.toISOString()}
                tabIndex={0}
                aria-label={`${label(w, i)}: ${pcs(v)}`}
                className="group relative flex h-full flex-1 items-end justify-center rounded-sm px-[2px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  className="w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity group-hover:opacity-75 group-focus:opacity-75"
                  style={{ height: v > 0 ? `max(2px, ${pct}%)` : 0 }}
                />
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper shadow group-hover:block group-focus:block ${tip}`}
                >
                  <strong>{pcs(v)}</strong>
                  <span className="opacity-75"> · {label(w, i)}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-1 flex justify-between text-[11px] text-subtle" aria-hidden>
          <span>{formatDate(weeks[0].start)}</span>
          <span>This week</span>
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-subtle hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-line">
            {[...weeks].reverse().map((w, i) => (
              <tr key={w.start.toISOString()}>
                <td className="py-1">{label(w, last - i)}</td>
                <td className="py-1 text-right">{pcs(w[field])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Pieces in the store by age band, as horizontal bars with the count beside each. */
export function AgeBars({ bands }: { bands: { label: string; pieces: number }[] }) {
  const max = Math.max(0, ...bands.map((b) => b.pieces));
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {bands.map((b) => (
        <li
          key={b.label}
          className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
        >
          <span className="text-subtle">{b.label}</span>
          <span className="h-4" aria-hidden>
            <span
              className="block h-full rounded-r-[4px] bg-chart"
              style={{ width: b.pieces > 0 ? `max(2px, ${(b.pieces / max) * 100}%)` : 0 }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">{pcs(b.pieces)}</span>
        </li>
      ))}
    </ul>
  );
}
