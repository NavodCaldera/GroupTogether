import type { Metadata } from "next";
import { Card, cx, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatLKR } from "@/lib/format";
import { oldOpenBaskets } from "@/server/agents/admin-screens";
import { requireAdmin } from "@/server/auth/session";
import { place } from "../agent-bits";

export const metadata: Metadata = { title: "2-month baskets" };

/** Within this many days of the limit, the day count turns amber. */
const SOON_DAYS = 7;

export default async function OldBasketsPage() {
  const admin = await requireAdmin("AGENTS");
  const { baskets, maxWaitDays } = await oldOpenBaskets(admin.id);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="2-month baskets" />
      {baskets.length === 0 && <EmptyState title="No open baskets" />}
      <ul className="grid gap-3 empty:hidden sm:grid-cols-2 lg:grid-cols-3">
        {baskets.map((b) => (
          <li key={b.id}>
            <Card className="flex h-full min-w-0 flex-col gap-1">
              <p
                className={cx(
                  "text-2xl font-semibold tabular-nums",
                  b.days >= maxWaitDays - SOON_DAYS && "text-warn",
                )}
              >
                {b.days} / {maxWaitDays} days
              </p>
              <h2 className="font-semibold">
                {place(b.factory)} → {b.agent.user.name}
              </h2>
              <p className="text-sm">
                {formatLKR(b.total)} · {formatDate(b.firstOrderAt)}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
