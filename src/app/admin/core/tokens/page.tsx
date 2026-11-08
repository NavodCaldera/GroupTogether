import type { Metadata } from "next";
import { Button, Card, cx, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { tokenLookup, tokensByKind } from "@/server/admin-core";
import { requireAdmin } from "@/server/auth/session";

export const metadata: Metadata = { title: "Tokens" };

const KIND: Record<string, string> = {
  CANCELLATION: "Cancellation",
  RETURN: "Return",
  HOLD: "Hold",
  RELEASE: "Release",
  SPEND: "Spent",
  LATE_PAYMENT: "Late payment",
  ORDER_CANCEL: "Order cancelled",
  AGENT_FEE: "Agent fee",
  COURIER_REPAY: "Courier repaid",
  MISSING_ITEM: "Missing item",
  DEPOSIT_RETURN: "Deposit returned",
  TRANSFER_OUT: "Sent",
  TRANSFER_IN: "Received",
};

export default async function TokensPage({ searchParams }: PageProps<"/admin/core/tokens">) {
  const admin = await requireAdmin("CORE");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [found, kinds] = await Promise.all([
    q ? tokenLookup(admin.id, q) : null,
    tokensByKind(admin.id),
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Tokens" />
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Email or phone
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Email or phone"
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button type="submit">Look up</Button>
      </form>
      {q && !found && <EmptyState title="No user found" />}
      {found && (
        <Card className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{found.user.name}</h2>
              <p className="text-sm break-words text-subtle">
                {found.user.email}
                {found.user.phone ? ` · ${found.user.phone}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-subtle">Balance</p>
              <p className="text-2xl font-semibold tabular-nums">{formatLKR(found.balance)}</p>
            </div>
          </div>
          {found.entries.length === 0 ? (
            <p className="text-sm">No token history</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
              {found.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-medium">{KIND[e.kind] ?? e.kind}</span>
                  <span className="min-w-0 flex-1 break-words text-subtle">{e.note}</span>
                  <span className={cx("tabular-nums", e.amount.isNegative() && "text-danger")}>
                    {formatLKR(e.amount)}
                  </span>
                  <span className="text-xs text-subtle">{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <section aria-labelledby="by-kind" className="flex min-w-0 flex-col gap-3">
        <h2 id="by-kind" className="text-lg font-semibold">
          By type
        </h2>
        {kinds.length === 0 ? (
          <EmptyState title="No tokens issued" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {kinds.map((k) => (
              <li key={k.kind}>
                <Card className="h-full p-3 sm:p-4">
                  <p className="text-xs text-subtle">
                    {KIND[k.kind] ?? k.kind} · {k.count}
                  </p>
                  <p className="font-semibold tabular-nums">{formatLKR(k.total)}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
