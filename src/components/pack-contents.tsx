import { formatLKR } from "@/lib/format";
import { Badge, Card } from "./ui";

/** What ONE family gets: fixed items, the price per family and the basket size. */
export function PackContents({
  items,
  price,
  families,
  householdSize,
  durationDays,
}: {
  items: { id: string; name: string; size: string; qty: number }[];
  price: { toString(): string };
  families: number;
  householdSize: number | null;
  durationDays: number;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Your family pack</h2>
        <span className="text-lg font-semibold">{formatLKR(price)}</span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 py-2 text-sm">
            <span>
              {i.name} <span className="text-subtle">{i.size}</span>
            </span>
            <span className="font-medium">× {i.qty}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge>{durationDays} days</Badge>
        <Badge tone="info">{families} families per basket</Badge>
        {householdSize ? <Badge>For {householdSize} people</Badge> : null}
      </div>
    </Card>
  );
}
