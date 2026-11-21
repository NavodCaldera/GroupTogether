import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cx, EmptyState, PageHeader } from "@/components/ui";
import { formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { formatTime, groupByDay, tokenEntryLabel, type TokenTone } from "@/lib/token-labels";
import { requireUser } from "@/server/auth/session";
import { tokenHistory } from "@/server/orders/buyer";
import { SendTokensForm } from "./send-form";

export const metadata: Metadata = { title: "Tokens" };

const ICON: Record<TokenTone, ReactNode> = {
  in: <path d="M17 7 7 17M17 17H7V7" />,
  out: <path d="M7 17 17 7M7 7h10v10" />,
  refund: (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  order: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
    </>
  ),
};

function Icon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx("size-4", className)}
    >
      {children}
    </svg>
  );
}

export default async function TokensPage() {
  const user = await requireUser([...BUYER_ROLES], "/tokens");
  const { balance, entries } = await tokenHistory(user.id);
  const days = groupByDay(entries);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Tokens" />
      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-subtle">Balance</p>
          <p
            className="text-4xl font-semibold tracking-tight tabular-nums"
            data-testid="token-balance"
          >
            {formatLKR(balance)}
          </p>
        </div>
        {balance.gt(0) && (
          <details className="group border-t border-line pt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-line px-4 text-sm font-medium hover:bg-muted sm:min-h-10 [&::-webkit-details-marker]:hidden">
              Send tokens
              <Icon className="transition group-open:rotate-90">
                <path d="m9 18 6-6-6-6" />
              </Icon>
            </summary>
            <div className="pt-4">
              <SendTokensForm max={balance.toFixed(2)} />
            </div>
          </details>
        )}
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
              <div className="overflow-hidden rounded-xl border border-line bg-paper">
                <ul className="flex flex-col divide-y divide-line">
                  {d.entries.map((e) => {
                    const { title, detail, tone } = tokenEntryLabel(e);
                    const credit = !e.amount.isNegative();
                    const row = (
                      <>
                        <span
                          className={cx(
                            "grid size-9 shrink-0 place-items-center rounded-full",
                            credit ? "bg-accent/15 text-accent" : "bg-muted text-ink",
                          )}
                        >
                          <Icon>{ICON[tone]}</Icon>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium break-words">{title}</span>
                          <span className="block text-xs break-words text-subtle">
                            {detail ? `${detail} · ` : ""}
                            {formatTime(e.createdAt)}
                          </span>
                        </span>
                        <span
                          className={cx(
                            "shrink-0 font-semibold whitespace-nowrap tabular-nums",
                            credit && "text-accent",
                          )}
                        >
                          {credit ? "+" : ""}
                          {formatLKR(e.amount)}
                        </span>
                      </>
                    );
                    const rowClass = "flex items-center gap-3 px-4 py-3";
                    return (
                      <li key={e.id}>
                        {e.orderId ? (
                          <Link
                            href={`/orders/${e.orderId}`}
                            className={cx(rowClass, "transition hover:bg-muted")}
                          >
                            {row}
                            <Icon className="-mr-1 shrink-0 text-subtle">
                              <path d="m9 18 6-6-6-6" />
                            </Icon>
                          </Link>
                        ) : (
                          <div className={rowClass}>
                            {row}
                            <span aria-hidden="true" className="-mr-1 size-4 shrink-0" />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
