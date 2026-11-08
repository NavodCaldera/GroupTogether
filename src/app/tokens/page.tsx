import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "@/server/auth/session";
import { tokenHistory } from "@/server/orders/buyer";
import { SendTokensForm } from "./send-form";

export const metadata: Metadata = { title: "Tokens" };

export default async function TokensPage() {
  const user = await requireUser([...BUYER_ROLES], "/tokens");
  const { balance, entries } = await tokenHistory(user.id);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader title="Tokens" />
      <Card>
        <p className="text-sm text-subtle">Balance</p>
        <p className="text-3xl font-semibold tabular-nums" data-testid="token-balance">
          {formatLKR(balance)}
        </p>
      </Card>

      {balance.gt(0) && (
        <section aria-labelledby="tokens-send" className="flex flex-col gap-2">
          <h2 id="tokens-send" className="text-lg font-semibold">
            Send
          </h2>
          <Card>
            <SendTokensForm max={balance.toFixed(2)} />
          </Card>
        </section>
      )}

      <section aria-labelledby="tokens-history" className="flex flex-col gap-2">
        <h2 id="tokens-history" className="text-lg font-semibold">
          History
        </h2>
        {entries.length === 0 ? (
          <EmptyState title="No tokens yet" />
        ) : (
          <Card>
            <ul className="flex flex-col divide-y divide-line">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{e.note}</p>
                    <p className="text-xs text-subtle">{formatDateTime(e.createdAt)}</p>
                  </div>
                  <p
                    className={`shrink-0 font-semibold tabular-nums ${e.amount.isNegative() ? "" : "text-accent"}`}
                  >
                    {e.amount.isNegative() ? "" : "+"}
                    {formatLKR(e.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
