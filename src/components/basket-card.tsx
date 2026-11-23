import Link from "next/link";
import { formatDate, formatLKR } from "@/lib/format";
import { formatDistance } from "@/lib/distance";
import { Badge } from "./ui";

type OpenBasket = {
  id: string;
  distanceKm: number;
  city: string | null;
  joined: number;
  size: number;
  spotsLeft: number;
  closesAt: Date;
  price: { toString(): string };
  packName: string;
  companyName: string;
  fromContact: boolean;
  mine: boolean;
};

/** One open basket: pack, distance, progress and spots left. No people's details (AD-9). */
export function BasketCard({ b, showCompany = false }: { b: OpenBasket; showCompany?: boolean }) {
  const pct = Math.round((b.joined / b.size) * 100);
  return (
    <Link
      href={`/baskets/${b.id}`}
      data-testid="open-basket"
      className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4 transition hover:border-accent"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {showCompany ? `${b.companyName} · ` : ""}
          {b.packName}
        </span>
        <span className="text-sm font-semibold">{formatLKR(b.price)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-subtle">
        <span>{formatDistance(b.distanceKm)}</span>
        {b.city ? <span>· {b.city}</span> : null}
        {b.fromContact ? <Badge tone="info">Contact</Badge> : null}
        {b.mine ? <Badge tone="good">You are in</Badge> : null}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={b.size}
        aria-valuenow={b.joined}
        aria-label={`${b.joined} of ${b.size} families`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>
          {b.joined} of {b.size} families · {b.spotsLeft} left
        </span>
        <span className="text-subtle">Closes {formatDate(b.closesAt)}</span>
      </div>
    </Link>
  );
}
