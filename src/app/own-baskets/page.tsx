import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/cart-bits";
import { BackLink } from "@/components/client";
import { FillBar } from "@/components/step-track";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { myOwnBaskets } from "@/server/orders/own-baskets";
import { getSettings } from "@/server/settings";
import { OWN_STATUS } from "./own-bits";

export const metadata: Metadata = { title: "Own baskets" };

type Row = Awaited<ReturnType<typeof myOwnBaskets>>[number];

const TONE: Record<string, "info" | "neutral" | "good" | "bad"> = {
  OPEN: "info",
  DELIVERED: "good",
  CANCELLED: "bad",
};

export default async function OwnBasketsPage() {
  const user = await requireUser([...BUYER_ROLES], "/own-baskets");
  const [baskets, settings] = await Promise.all([myOwnBaskets(user.id), getSettings()]);
  const past = (b: Row) => b.status === "DELIVERED" || b.status === "CANCELLED";
  const groups = [
    { title: "In progress", rows: baskets.filter((b) => !past(b)) },
    { title: "Past", rows: baskets.filter(past) },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div>
        <BackLink fallback="/orders" />
        <PageHeader title="Own baskets" />
      </div>
      {baskets.length === 0 ? (
        <EmptyState title="No own baskets" />
      ) : (
        groups.map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
            {groups.length > 1 && <h2 className="text-lg font-semibold">{g.title}</h2>}
            <ul className="flex flex-col gap-3">
              {g.rows.map((b) => (
                <li key={b.id}>
                  <BasketRow basket={b} minItems={settings.ownMinItems} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function BasketRow({ basket: b, minItems }: { basket: Row; minItems: number }) {
  const open = b.status === "OPEN";
  return (
    <div className="relative flex gap-3 rounded-xl border border-line bg-paper p-4 hover:border-subtle">
      {b.product && (
        <div className="w-14 shrink-0">
          <ProductImage {...b.product} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/own-baskets/${b.id}`}
            className="min-w-0 font-semibold underline-offset-2 after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline"
          >
            <span className="line-clamp-2">{b.title}</span>
          </Link>
          <Badge tone={TONE[b.status] ?? "neutral"}>{OWN_STATUS[b.status] ?? b.status}</Badge>
        </div>
        <p className="text-sm text-subtle">
          {b.owner ? "Yours" : "Joined"} · {b.area}
        </p>
        {open ? (
          <div className="flex flex-col gap-1">
            <FillBar value={b.items / Math.max(minItems, 1)} label={`${b.title} progress`} />
            <p className="text-xs text-subtle tabular-nums">
              <strong className="text-ink">{b.items}</strong> of {minItems} items
            </p>
          </div>
        ) : (
          <p className="text-xs text-subtle tabular-nums">
            {b.items} {b.items === 1 ? "item" : "items"}
          </p>
        )}
      </div>
    </div>
  );
}
