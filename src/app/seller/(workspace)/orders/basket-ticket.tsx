import { Badge } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { type BasketCard, STAGE_LABEL } from "@/server/factory-dashboard";
import { Ticket } from "@/app/seller/factory-bits";
import { GivenToDriver, MarkPacked, ReportMissing } from "./basket-actions";

const TONE = {
  OPEN: "neutral",
  LOCKED: "neutral",
  PACKED: "neutral",
  WITH_COURIER: "neutral",
  AT_AGENT: "good",
} as const;

/**
 * One basket as a cutting ticket: the agent and area, its lines by product, size and colour, the
 * driver once booked, and the next packing step for a login that packs. Money only when `money`.
 */
export function BasketTicket({
  basket: b,
  money,
  packs,
}: {
  basket: BasketCard;
  money: boolean;
  packs: boolean;
}) {
  const packing = b.status === "LOCKED";
  return (
    <Ticket
      tone={b.status === "LOCKED" ? "accent" : "ink"}
      head={
        <>
          <span className="min-w-0 text-xl font-bold break-words">{b.agent.user.name}</span>
          <Badge tone={TONE[b.status]}>{STAGE_LABEL[b.status]}</Badge>
        </>
      }
      foot={
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-subtle">Pieces</dt>
            <dd className="tabular-nums">{b.pieces}</dd>
            {money && (
              <>
                <dt className="text-subtle">Total</dt>
                <dd className="tabular-nums">{formatLKR(b.total)}</dd>
              </>
            )}
            {b.lockedAt && (
              <>
                <dt className="text-subtle">Locked on</dt>
                <dd>{formatDate(b.lockedAt)}</dd>
              </>
            )}
            {b.courier && (
              <>
                <dt className="text-subtle">Driver</dt>
                <dd className="break-words">{b.courier.driverName}</dd>
                <dt className="text-subtle">Phone</dt>
                <dd>
                  <a
                    href={`tel:${b.courier.driverPhone}`}
                    className="inline-flex min-h-10 items-center text-accent underline"
                  >
                    {b.courier.driverPhone}
                  </a>
                </dd>
                <dt className="text-subtle">Vehicle</dt>
                <dd className="break-words">{b.courier.vehicleNo}</dd>
              </>
            )}
          </dl>
          {packs && b.status === "LOCKED" && <MarkPacked basketId={b.id} />}
          {packs && b.status === "PACKED" && b.courier && <GivenToDriver basketId={b.id} />}
        </>
      }
    >
      <p className="mb-2 text-sm text-subtle break-words">
        {[b.agent.address, b.agent.city].filter(Boolean).join(", ")}
      </p>
      {b.products.map((p) => (
        <div key={p.title} className="border-t border-line py-2 first-of-type:border-t-0">
          <h3 className="font-bold break-words">{p.title}</h3>
          <ul className="flex flex-col">
            {p.lines.map((l) => {
              const label = [p.title, l.size, l.colour].filter(Boolean).join(", ");
              return (
                <li key={l.id} aria-label={label} className="py-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="text-xl font-bold">{l.size}</span>
                      {l.colour && <span className="ml-2">{l.colour}</span>}
                    </span>
                    <span className="text-xl font-bold tabular-nums">{l.qty}</span>
                  </div>
                  {l.reportedQty > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone="bad">Missing reported: {l.reportedQty}</Badge>
                      {l.note && <span className="break-words">{l.note}</span>}
                    </p>
                  )}
                  {packs && packing && l.reportable && (
                    <ReportMissing lineId={l.id} max={l.qty} label={label} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Ticket>
  );
}
