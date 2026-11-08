import { formatDate, formatLKR } from "@/lib/format";
import type { factoryEarnings } from "@/server/factory-dashboard";
import { Figure } from "@/app/seller/factory-bits";

type Earnings = Awaited<ReturnType<typeof factoryEarnings>>;

/** This week's earned amount and the Sunday it is paid, with what is held or waiting to come off. */
export function EarningsSummary({ e }: { e: Earnings }) {
  return (
    <div className="grid grid-cols-2 gap-3 border-y-2 border-ink py-3">
      <Figure label="Earned this week" value={formatLKR(e.earned)} />
      <Figure label="Paid on" value={`Sun ${formatDate(e.nextSunday)}`} />
      {e.held.gt(0) && <Figure label="Held" value={formatLKR(e.held)} />}
      {e.deductions.gt(0) && <Figure label="Deductions waiting" value={formatLKR(e.deductions)} />}
    </div>
  );
}
