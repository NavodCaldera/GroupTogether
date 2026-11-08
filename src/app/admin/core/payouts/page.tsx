import type { Metadata } from "next";
import { Badge, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime, formatLKR } from "@/lib/format";
import { adminPayouts } from "@/server/admin-core";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";
import { markPayoutPaidAction } from "../actions";

export const metadata: Metadata = { title: "Payouts" };

const factoryName = (f: { name: string; company: string | null }) => f.company || f.name;

export default async function PayoutsPage() {
  const admin = await requireAdmin("CORE");
  const { drafts, paid } = await adminPayouts(admin.id);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Payouts" />
      <section aria-labelledby="to-pay" className="flex min-w-0 flex-col gap-3">
        <h2 id="to-pay" className="text-lg font-semibold">
          To pay ({drafts.length})
        </h2>
        {drafts.length === 0 && <EmptyState title="No payouts to pay" />}
        <ul className="grid gap-3 empty:hidden lg:grid-cols-2">
          {drafts.map((p) => (
            <li key={p.id}>
              <Card className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{factoryName(p.factory)}</h3>
                    <p className="text-sm text-subtle">Week ending {formatDate(p.weekEnding)}</p>
                  </div>
                  <p className="text-2xl font-semibold tabular-nums">{formatLKR(p.net)}</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-subtle">Lines</dt>
                    <dd className="tabular-nums">{p._count.items}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Gross</dt>
                    <dd className="tabular-nums">{formatLKR(p.gross)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Deductions</dt>
                    <dd className="tabular-nums">{formatLKR(p.deductions)}</dd>
                  </div>
                </dl>
                <AdminForm action={markPayoutPaidAction} submit="Mark paid">
                  <input type="hidden" name="payoutId" value={p.id} />
                  <Field label="Bank reference" name={`ref-${p.id}`}>
                    <Input
                      id={`ref-${p.id}`}
                      name="bankRef"
                      maxLength={100}
                      autoComplete="off"
                      required
                    />
                  </Field>
                </AdminForm>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      {paid.length > 0 && (
        <section aria-labelledby="paid" className="flex min-w-0 flex-col gap-3">
          <h2 id="paid" className="text-lg font-semibold">
            Paid
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
            {paid.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Badge tone="good">Paid</Badge>
                <span className="min-w-0 flex-1 font-medium">{factoryName(p.factory)}</span>
                <span className="tabular-nums">{formatLKR(p.net)}</span>
                <span className="break-all">{p.bankRef}</span>
                <span className="text-xs text-subtle">{formatDateTime(p.paidAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
