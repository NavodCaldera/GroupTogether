import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { myOwnBaskets } from "@/server/orders/own-baskets";
import { itemsLabel, OWN_STATUS } from "./own-bits";

export const metadata: Metadata = { title: "Own baskets" };

export default async function OwnBasketsPage() {
  const user = await requireUser([...BUYER_ROLES], "/own-baskets");
  const baskets = await myOwnBaskets(user.id);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Own baskets" />
      {baskets.length === 0 ? (
        <EmptyState title="No own baskets" />
      ) : (
        <ul className="flex flex-col gap-3">
          {baskets.map((b) => (
            <li key={b.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/own-baskets/${b.id}`}
                    className="inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline sm:min-h-10"
                  >
                    {b.title}
                  </Link>
                  <p className="text-sm text-subtle">
                    {b.owner ? "Yours" : "Joined"} · {b.area} · {itemsLabel(b.items)}
                  </p>
                </div>
                <Badge>{OWN_STATUS[b.status] ?? b.status}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
