import type { Metadata } from "next";
import { Badge, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { formatDateTime, formatLKR } from "@/lib/format";
import { courierToBook, paymentProblems } from "@/server/agents/admin-screens";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../admin-form";
import { bookCourierAction } from "./actions";
import { place } from "./agent-bits";

export const metadata: Metadata = { title: "Agents and orders" };

const OUTCOME: Record<string, string> = {
  AMOUNT_MISMATCH: "Amount mismatch",
  CURRENCY_MISMATCH: "Currency mismatch",
  UNKNOWN_ATTEMPT: "Unknown payment",
};

export default async function AgentsAdminHome() {
  const admin = await requireAdmin("AGENTS");
  const [baskets, problems] = await Promise.all([
    courierToBook(admin.id),
    paymentProblems(admin.id),
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Agents and orders" />
      <section aria-labelledby="courier" className="flex min-w-0 flex-col gap-3">
        <h2 id="courier" className="text-lg font-semibold">
          Courier to book ({baskets.length})
        </h2>
        {baskets.length === 0 && <EmptyState title="No packed baskets" />}
        <ul className="grid gap-3 lg:grid-cols-2">
          {baskets.map((b) => (
            <li key={b.id}>
              <Card className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">
                      {place(b.factory)} → {b.agent.user.name}
                    </h3>
                    <p className="text-sm text-subtle">
                      {b.agent.address}
                      {b.agent.city ? `, ${b.agent.city}` : ""}
                    </p>
                  </div>
                  {b.courier ? <Badge tone="info">Booked</Badge> : <Badge>Packed</Badge>}
                </div>
                <p className="text-sm">
                  {b.pieces} pieces · {formatLKR(b.total)} · Locked {formatDateTime(b.lockedAt)}
                </p>
                <AdminForm action={bookCourierAction} submit={b.courier ? "Re-book" : "Book"}>
                  <input type="hidden" name="basketId" value={b.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Courier fee (LKR)" name={`fee-${b.id}`}>
                      <Input
                        id={`fee-${b.id}`}
                        name="fee"
                        inputMode="decimal"
                        defaultValue={b.courier?.fee.toString()}
                        required
                      />
                    </Field>
                    <Field label="Driver" name={`driver-${b.id}`}>
                      <Input
                        id={`driver-${b.id}`}
                        name="driverName"
                        maxLength={100}
                        defaultValue={b.courier?.driverName}
                        required
                      />
                    </Field>
                    <Field label="Driver phone" name={`phone-${b.id}`}>
                      <Input
                        id={`phone-${b.id}`}
                        name="driverPhone"
                        type="tel"
                        maxLength={100}
                        defaultValue={b.courier?.driverPhone}
                        required
                      />
                    </Field>
                    <Field label="Vehicle" name={`vehicle-${b.id}`}>
                      <Input
                        id={`vehicle-${b.id}`}
                        name="vehicleNo"
                        maxLength={100}
                        defaultValue={b.courier?.vehicleNo}
                        required
                      />
                    </Field>
                  </div>
                </AdminForm>
              </Card>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="payments" className="flex min-w-0 flex-col gap-3">
        <h2 id="payments" className="text-lg font-semibold">
          Payment problems ({problems.late.length + problems.mismatched.length})
        </h2>
        {problems.late.length + problems.mismatched.length === 0 && (
          <EmptyState title="No payment problems" />
        )}
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line empty:hidden">
          {problems.late.map((p) => {
            const who = p.buyer ?? p.agent?.user;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Badge tone="bad">Late paid</Badge>
                <span className="min-w-0 flex-1">
                  {who?.name} {who?.phone ? `· ${who.phone}` : ""}
                  {p.purpose === "DEPOSIT" ? " · Deposit" : ""}
                </span>
                <span className="tabular-nums">{formatLKR(p.amount)}</span>
                <span className="text-xs text-subtle">{formatDateTime(p.createdAt)}</span>
              </li>
            );
          })}
          {problems.mismatched.map((e) => {
            const who = e.attempt?.buyer ?? e.attempt?.agent?.user;
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Badge tone="bad">{OUTCOME[String(e.outcome)] ?? String(e.outcome)}</Badge>
                <span className="min-w-0 flex-1">
                  {who?.name ?? "—"} {who?.phone ? `· ${who.phone}` : ""}
                </span>
                {e.attempt && <span className="tabular-nums">{formatLKR(e.attempt.amount)}</span>}
                <span className="text-xs text-subtle">{formatDateTime(e.verifiedAt)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
