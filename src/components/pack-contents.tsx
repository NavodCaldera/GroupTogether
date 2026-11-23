import { formatLKR } from "@/lib/format";
import { Badge, Card, cx } from "./ui";

/** What ONE family gets: fixed items and the price; a basket's size, or a pack's size table. */
export function PackContents({
  items,
  price,
  families,
  sizes,
  householdSize,
  durationDays,
}: {
  items: {
    id: string;
    name: string;
    size: string;
    qty: number;
    retailPrice: { toString(): string } | null;
    photo: string | null;
  }[];
  price: { toString(): string };
  families?: number;
  sizes?: Parameters<typeof SizeTable>[0]["sizes"];
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
          <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
            {i.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={i.photo}
                alt=""
                className="size-14 shrink-0 rounded-lg bg-muted object-cover"
              />
            ) : (
              <span className="size-14 shrink-0 rounded-lg bg-muted" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{i.name}</span>
              <span className="text-subtle">
                {i.size}
                {i.retailPrice ? ` · ${formatLKR(i.retailPrice)} each in shops` : ""}
              </span>
            </span>
            <span className="font-semibold">× {i.qty}</span>
          </li>
        ))}
      </ul>
      {sizes ? <SizeTable sizes={sizes} /> : null}
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge>{durationDays} days</Badge>
        {families ? <Badge tone="info">{families} families per basket</Badge> : null}
        {householdSize ? <Badge>Family of {householdSize}</Badge> : null}
      </div>
    </Card>
  );
}

/** The company's photo of all the pack's items together, or a plain placeholder. */
export function PackPhoto({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cx("aspect-video w-full bg-muted object-cover", className)} />
  ) : (
    <div
      className={cx("grid aspect-video w-full place-items-center bg-muted text-subtle", className)}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-10 fill-none stroke-current stroke-[1.5]"
      >
        <path d="M3 9h18l-2 11H5zM8 9l4-6 4 6" />
      </svg>
    </div>
  );
}

/** Basket sizes with their discount and price per family. */
export function SizeTable({
  sizes,
}: {
  sizes: { size: number; pct: { toString(): string }; price: { toString(): string } }[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-subtle">
          <th scope="col" className="py-1.5 font-medium">
            Families
          </th>
          <th scope="col" className="py-1.5 font-medium">
            Discount
          </th>
          <th scope="col" className="py-1.5 text-right font-medium">
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {sizes.map((s) => (
          <tr key={s.size} className="border-b border-line last:border-0">
            <td className="py-1.5">{s.size}</td>
            <td className="py-1.5 font-medium text-accent">{s.pct.toString()}%</td>
            <td className="py-1.5 text-right font-semibold">{formatLKR(s.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
