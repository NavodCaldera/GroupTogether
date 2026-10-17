import { D } from "@/lib/decimal";
import { formatDate, formatLKR } from "@/lib/format";

type Day = { day: Date; total: D; orders: number };

/**
 * Confirmed sales per day as columns. Server-rendered, no JS: each day is a focusable column
 * (the whole column is the hit target) with a CSS tooltip; "Show as table" gives the numbers.
 * Bars: <= 24px, 4px rounded top, one baseline, `--chart` colour (validated for both themes).
 */
export function SalesChart({ days }: { days: Day[] }) {
  const max = days.reduce((m, d) => D.max(m, d.total), new D(0));
  const last = days.length - 1;
  const label = (d: Day, i: number) => (i === last ? "Today" : formatDate(d.day));

  return (
    <figure>
      <figcaption className="sr-only">Confirmed sales per day, last {days.length} days</figcaption>
      <div className="relative">
        {max.gt(0) && (
          <span className="absolute -top-5 right-0 text-[11px] text-subtle">{formatLKR(max)}</span>
        )}
        <ol className="flex h-32 items-end border-t border-b border-line pt-2">
          {days.map((d, i) => {
            const pct = max.gt(0) ? d.total.div(max).times(100).toNumber() : 0;
            const tip = i < 3 ? "left-0" : i > last - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <li
                key={d.day.toISOString()}
                tabIndex={0}
                aria-label={`${label(d, i)}: ${formatLKR(d.total)}, ${d.orders} ${d.orders === 1 ? "order" : "orders"}`}
                className="group relative flex h-full flex-1 items-end justify-center rounded-sm px-[1px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  className="w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity group-hover:opacity-75 group-focus:opacity-75"
                  style={{ height: d.total.gt(0) ? `max(2px, ${pct}%)` : 0 }}
                />
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper shadow group-hover:block group-focus:block ${tip}`}
                >
                  <strong>{formatLKR(d.total)}</strong>
                  <span className="opacity-75">
                    {" "}
                    · {label(d, i)} · {d.orders} {d.orders === 1 ? "order" : "orders"}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-1 flex justify-between text-[11px] text-subtle" aria-hidden>
          <span>{label(days[0], 0)}</span>
          <span>{label(days[Math.floor(last / 2)], Math.floor(last / 2))}</span>
          <span>Today</span>
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-subtle hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-line">
            {[...days].reverse().map((d, i) => (
              <tr key={d.day.toISOString()}>
                <td className="py-1">{label(d, last - i)}</td>
                <td className="py-1 text-right text-subtle">{d.orders}</td>
                <td className="py-1 text-right">{formatLKR(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
