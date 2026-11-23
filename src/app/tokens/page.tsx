import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { formatTime, groupByDay } from "@/lib/token-labels";
import { redirectCompany, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";

export const metadata: Metadata = { title: "Tokens" };

const TITLE = { PACK_REFUND: "Basket refund", LATE_PAYMENT: "Payment returned" } as const;

export default async function TokensPage() {
  const user = await requireUser("/tokens");
  await redirectCompany();
  const [balance, entries] = await Promise.all([
    tokenBalance(user.id),
    db.tokenEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  const days = groupByDay(entries);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Tokens" />
      <Card>
        <p className="text-sm text-subtle">Balance</p>
        <p
          className="text-4xl font-semibold tracking-tight tabular-nums"
          data-testid="token-balance"
        >
          {formatLKR(balance)}
        </p>
      </Card>
      <section aria-labelledby="tokens-history" className="flex flex-col gap-3">
        <h2 id="tokens-history" className="text-lg font-semibold">
          History
        </h2>
        {days.length === 0 ? (
          <EmptyState title="No tokens yet" />
        ) : (
          days.map((d) => (
            <div key={d.day} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-xs font-medium tracking-wide text-subtle uppercase">
                {d.label}
              </h3>
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {d.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{TITLE[e.kind]}</span>
                      <span className="block text-xs break-words text-subtle">
                        {e.note} · {formatTime(e.createdAt)}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold whitespace-nowrap text-accent tabular-nums">
                      +{formatLKR(e.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
