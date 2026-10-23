import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { Badge } from "@/components/ui";
import type { DemandLabel } from "@/lib/design-rules";
import { formatLKR } from "@/lib/format";
import type { SellerDesign } from "@/server/designs";
import { pcs } from "./design-chart";

const LABEL: Record<DemandLabel, { text: string; tone: "good" | "neutral" | "bad" }> = {
  fast: { text: "Selling fast", tone: "good" },
  average: { text: "Average", tone: "neutral" },
  slow: { text: "Selling slow", tone: "bad" },
};

/** How a design sells against similar designs (same audience and category). */
export function DemandBadge({ label }: { label: DemandLabel | null }) {
  if (!label) return null;
  return <Badge tone={LABEL[label].tone}>{LABEL[label].text}</Badge>;
}

/** One design on the seller's home: photo, name, test or bulk, demand, price and pieces. */
export function DesignCard({ d }: { d: SellerDesign }) {
  return (
    <Link
      href={`/seller/designs/${d.id}`}
      className="flex gap-3 rounded-xl border border-line p-3 hover:bg-muted"
    >
      <div className="w-16 shrink-0">
        <ProductImage
          photoKey={d.photoKey}
          id={d.id}
          title={d.title}
          category={d.category}
          className="text-2xl"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <p className="min-w-0 font-medium break-words">{d.title}</p>
          <div className="flex gap-1">
            {d.stage === "test" && <Badge tone="info">Test</Badge>}
            {d.stage === "bulk" && <Badge tone="info">Bulk</Badge>}
            <DemandBadge label={d.label} />
          </div>
        </div>
        <p className="mt-0.5 text-sm tabular-nums">
          {pcs(d.bought)} bought · {pcs(d.wanted)} wanted · {d.people}{" "}
          {d.people === 1 ? "person" : "people"}
        </p>
        <p className="mt-0.5 text-xs text-subtle tabular-nums">
          {formatLKR(d.price)} · {d.sold} of {d.stocked} sold · {d.rate} pcs a day
        </p>
      </div>
    </Link>
  );
}
