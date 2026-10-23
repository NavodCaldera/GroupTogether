import type { ChartDay } from "@/lib/design-rules";
import { maxOf } from "@/lib/design-rules";
import { D } from "@/lib/decimal";
import { formatDate, formatLKR } from "@/lib/format";

export const pcs = (n: number) => `${n.toLocaleString("en-LK")} ${n === 1 ? "pc" : "pcs"}`;

/**
 * A design's shop price and the pieces put in carts each day (product owner, 2026-10-24), as two
 * panels on one time axis: the price as a step line on top, pieces below as bars (bought, then
 * wanted but not bought, on one scale). Two panels, never two y-axes on one chart. Server-rendered,
 * no JS: each day is a focusable column with a CSS tooltip; "Show as table" gives the numbers.
 */
export function PriceQuantityChart({ days }: { days: ChartDay[] }) {
  const n = days.length;
  const prices = days.flatMap((d) => (d.price ? [d.price] : []));
  if (n === 0 || prices.length === 0) return null;
  const hi = D.max(...prices);
  const lo = D.min(...prices);
  // Only the line's position is a number; amounts stay D.
  const y = (p: D) => (hi.eq(lo) ? 50 : 28 + hi.minus(p).div(hi.minus(lo)).times(52).toNumber());
  // Each price label sits just above its level of the line (the price panel is 6rem = 96px).
  const labelTop = (p: D) => `calc(${y(p) * 0.96}px - 17px)`;
  let path = "";
  let prev: number | null = null;
  days.forEach((d, i) => {
    if (!d.price) {
      prev = null;
      return;
    }
    const v = y(d.price);
    path += prev === null ? `M${i} ${v}` : prev !== v ? `L${i} ${v}` : "";
    path += `L${i + 1} ${v}`;
    prev = v;
  });
  const top = maxOf(days.map((d) => d.wanted));
  const last = n - 1;
  const label = (d: ChartDay, i: number) => (i === last ? "Today" : formatDate(d.start));

  return (
    <figure className="min-w-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-chart" aria-hidden /> Price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart" aria-hidden /> Bought
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-chart-2" aria-hidden /> Wanted, not bought
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${n} 100`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 w-full overflow-visible"
          aria-hidden
        >
          <path
            d={path}
            fill="none"
            stroke="var(--chart)"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="pointer-events-none absolute left-0 text-[11px] text-subtle tabular-nums"
          style={{ top: labelTop(hi) }}
        >
          {formatLKR(hi)}
        </span>
        {!hi.eq(lo) && (
          <span
            className="pointer-events-none absolute left-0 text-[11px] text-subtle tabular-nums"
            style={{ top: labelTop(lo) }}
          >
            {formatLKR(lo)}
          </span>
        )}
        <span className="pointer-events-none absolute top-[6.5rem] left-0 text-[11px] text-subtle tabular-nums">
          {pcs(top)}
        </span>
        <ol className="flex">
          {days.map((d, i) => {
            const notBought = d.wanted - d.bought;
            const tip =
              i < n / 3 ? "left-0" : i > (2 * n) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <li
                key={d.start.toISOString()}
                tabIndex={0}
                aria-label={`${label(d, i)}: ${d.price ? formatLKR(d.price) : "no price"}, ${pcs(d.wanted)} wanted, ${pcs(d.bought)} bought`}
                className="group relative flex min-w-0 flex-1 flex-col rounded-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="h-24 border-b border-line" />
                <span className="flex h-28 items-end justify-center border-b border-line px-[1px] pt-5">
                  <span className="flex h-full w-full max-w-6 flex-col justify-end gap-[2px]">
                    {notBought > 0 && (
                      <span
                        className="rounded-t-[4px] bg-chart-2"
                        style={{ height: `max(2px, ${(notBought / top) * 100}%)` }}
                      />
                    )}
                    {d.bought > 0 && (
                      <span
                        className={`bg-chart ${notBought > 0 ? "" : "rounded-t-[4px]"}`}
                        style={{ height: `max(2px, ${(d.bought / top) * 100}%)` }}
                      />
                    )}
                  </span>
                </span>
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper shadow group-hover:block group-focus:block ${tip}`}
                >
                  <strong>{label(d, i)}</strong>
                  {d.price && <span> · {formatLKR(d.price)}</span>}
                  <span className="opacity-75">
                    {" "}
                    · {pcs(d.bought)} bought · {pcs(d.wanted)} wanted
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="mt-1 flex justify-between text-[11px] text-subtle" aria-hidden>
          <span>{formatDate(days[0].start)}</span>
          <span>Today</span>
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-subtle hover:text-ink">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-subtle">
            <tr>
              <th className="py-1 text-left font-normal">Day</th>
              <th className="py-1 text-right font-normal">Price</th>
              <th className="py-1 text-right font-normal">Wanted</th>
              <th className="py-1 text-right font-normal">Bought</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...days].reverse().map((d, i) => (
              <tr key={d.start.toISOString()}>
                <td className="py-1">{label(d, last - i)}</td>
                <td className="py-1 text-right">{d.price ? formatLKR(d.price) : "—"}</td>
                <td className="py-1 text-right">{d.wanted}</td>
                <td className="py-1 text-right">{d.bought}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
