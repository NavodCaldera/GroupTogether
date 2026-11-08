import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { gatewayFee } from "@/lib/agent-money";
import { toD } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import { AGENT_ACCESS } from "@/server/auth/service";
import { getCurrentUser } from "@/server/auth/session";
import { myApplication } from "@/server/agents/screens";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";
import { ApplyForm, PayDepositForm } from "./apply-forms";

export const metadata: Metadata = { title: "Become an agent" };

export default async function AgentApplyPage() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <PageHeader title="Become an agent" />
        <Card className="flex flex-wrap gap-2">
          <LinkButton href="/sign-in?next=%2Fagents%2Fapply">Sign in</LinkButton>
          <LinkButton href="/sign-up" variant="secondary">
            Join free
          </LinkButton>
        </Card>
      </div>
    );
  const application = await myApplication(user.id);
  if (user.role === "AGENT" && application && AGENT_ACCESS.includes(application.status))
    redirect("/agent");

  const frame = (children: ReactNode, badge?: ReactNode) => (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Become an agent</h1>
        {badge}
      </div>
      {children}
    </div>
  );

  if (user.role !== "CUSTOMER" && user.role !== "AGENT")
    return frame(<Alert tone="info">This account cannot apply</Alert>);
  if (application?.status === "LEFT")
    return frame(<Alert tone="info">Agent account closed</Alert>, <Badge>Left</Badge>);
  if (application?.status === "APPLIED")
    return frame(
      <Card className="flex flex-col gap-1">
        <p className="font-medium">{application.address}</p>
        {application.city && <p className="text-sm text-subtle">{application.city}</p>}
      </Card>,
      <Badge tone="info">Applied</Badge>,
    );
  if (application?.status === "APPROVED") {
    const [settings, hours] = await Promise.all([
      getSettings(),
      db.agentHours.count({ where: { agentId: application.id } }),
    ]);
    const deposit = toD(settings.agentDeposit);
    const fee = gatewayFee(deposit, toD(settings.gatewayFeeRate));
    return frame(
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Deposit</h2>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
          <dt>Deposit</dt>
          <dd className="text-right">{formatLKR(deposit)}</dd>
          <dt>Payment fee</dt>
          <dd className="text-right">{formatLKR(fee)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{formatLKR(deposit.plus(fee))}</dd>
        </dl>
        {hours ? (
          <>
            <LinkButton href="/agent/hours" variant="secondary">
              Opening hours
            </LinkButton>
            <PayDepositForm />
          </>
        ) : (
          <LinkButton href="/agent/hours">Set opening hours</LinkButton>
        )}
      </Card>,
      <Badge tone="good">Approved</Badge>,
    );
  }
  return frame(
    <>
      {application?.status === "REJECTED" && (
        <Alert>Not approved{application.statusNote ? `: ${application.statusNote}` : ""}</Alert>
      )}
      <Card>
        <ApplyForm defaults={user} />
      </Card>
    </>,
  );
}
