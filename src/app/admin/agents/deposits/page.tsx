import type { Metadata } from "next";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { agentDeposits } from "@/server/agents/admin-screens";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";
import { liftSuspensionAction, recordLossAction, suspendAgentAction } from "../actions";

export const metadata: Metadata = { title: "Deposits and losses" };

const STATUS: Record<string, [string, "good" | "bad" | "neutral"]> = {
  LIVE: ["Live", "good"],
  SUSPENDED: ["Suspended", "bad"],
  LEAVING: ["Leaving", "neutral"],
};

const summary = "flex min-h-11 cursor-pointer items-center px-3 font-medium";

export default async function AgentDepositsPage() {
  const admin = await requireAdmin("AGENTS");
  const agents = await agentDeposits(admin.id);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Deposits and losses" />
      {agents.length === 0 && <EmptyState title="No agents" />}
      <ul className="grid gap-4 empty:hidden lg:grid-cols-2">
        {agents.map((a) => {
          const [label, tone] = STATUS[a.status] ?? [a.status, "neutral"];
          return (
            <li key={a.id}>
              <Card className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{a.user.name}</h2>
                    <p className="text-sm text-subtle">
                      {a.address}
                      {a.user.phone ? ` · ${a.user.phone}` : ""}
                    </p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                {a.statusNote && <p className="text-sm break-words">{a.statusNote}</p>}
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-subtle">Deposit</dt>
                    <dd className="font-semibold tabular-nums">{formatLKR(a.depositAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Losses</dt>
                    <dd className="font-semibold tabular-nums">{formatLKR(a.lossAmount)}</dd>
                  </div>
                </dl>
                {a.losses.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line rounded-lg border border-line text-sm">
                    {a.losses.map((l) => (
                      <li key={l.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                        <span className="min-w-0 flex-1 break-words">{l.reason}</span>
                        <span className="tabular-nums">{formatLKR(l.amount)}</span>
                        <span className="text-xs text-subtle">{formatDateTime(l.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <details className="rounded-lg border border-line">
                  <summary className={summary}>Record a loss</summary>
                  <div className="p-3 pt-0">
                    <AdminForm action={recordLossAction} submit="Record loss" variant="danger">
                      <input type="hidden" name="agentId" value={a.id} />
                      <Field label="Amount (LKR)" name={`amount-${a.id}`}>
                        <Input id={`amount-${a.id}`} name="amount" inputMode="decimal" required />
                      </Field>
                      <Field label="Reason" name={`loss-reason-${a.id}`}>
                        <Textarea
                          id={`loss-reason-${a.id}`}
                          name="reason"
                          maxLength={500}
                          required
                        />
                      </Field>
                      <Field label="Photos" name={`photos-${a.id}`}>
                        <Input
                          id={`photos-${a.id}`}
                          name="photos"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          multiple
                          required
                          className="py-2"
                        />
                      </Field>
                    </AdminForm>
                  </div>
                </details>
                {a.status === "LIVE" && (
                  <details className="rounded-lg border border-line">
                    <summary className={summary}>Suspend</summary>
                    <div className="p-3 pt-0">
                      <AdminForm action={suspendAgentAction} submit="Suspend" variant="danger">
                        <input type="hidden" name="agentId" value={a.id} />
                        <Field label="Reason" name={`suspend-${a.id}`}>
                          <Input id={`suspend-${a.id}`} name="reason" maxLength={500} required />
                        </Field>
                      </AdminForm>
                    </div>
                  </details>
                )}
                {a.status === "SUSPENDED" && (
                  <AdminForm
                    action={liftSuspensionAction}
                    submit="Lift suspension"
                    variant="secondary"
                  >
                    <input type="hidden" name="agentId" value={a.id} />
                  </AdminForm>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
