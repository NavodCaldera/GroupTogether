import { formatDateTime, formatLKR } from "@/lib/format";
import type { dealView } from "@/server/deals";

type View = NonNullable<Awaited<ReturnType<typeof dealView>>>;

/** A running group deal on the product page: units sold, the next price, and the tiers. */
export function DealBar({ deal }: { deal: View }) {
  const target = deal.next ? deal.sold + deal.next.more : deal.sold;
  const pct = target > 0 ? Math.min(100, Math.round((deal.sold / target) * 100)) : 100;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3" data-testid="deal-bar">
      <p className="text-sm font-semibold tabular-nums">
        {deal.sold.toLocaleString("en-LK")} sold
        {deal.next &&
          ` · ${deal.next.more.toLocaleString("en-LK")} more to ${formatLKR(deal.next.price)}`}
      </p>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Units sold toward the next price"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <ul className="flex flex-wrap gap-1.5 text-xs tabular-nums">
        {deal.tiers.map((t) => (
          <li
            key={t.minQty}
            className={`rounded-full border px-2 py-0.5 ${
              t.price.eq(deal.now) ? "border-accent bg-accent text-on-accent" : "border-line"
            }`}
          >
            {t.minQty.toLocaleString("en-LK")}+ {formatLKR(t.price)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle">
        Ends {formatDateTime(deal.endsAt)}
        {deal.left !== null && ` · ${deal.left.toLocaleString("en-LK")} left`}
      </p>
    </div>
  );
}
