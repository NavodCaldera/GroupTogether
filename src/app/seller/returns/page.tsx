import { factoryFaults, listHoldMessages, HoldError } from "@/server/fault-holds";
import { HoldThread, FaultList } from "@/components/fault-bits";
import { Card, Badge, LinkButton } from "@/components/ui";
import { getCurrentUser, requireFactory } from "@/server/auth/session";
import { factoryReturns, escalateOverdue, listReturnMessages } from "@/server/returns";
import { notFound } from "next/navigation";
import { ReturnThread } from "@/components/return-thread";
import { FactoryShell } from "../factory-bits";
import { ReturnCard } from "@/components/return-card";
import { EmptyState } from "@/components/ui";
export const metadata = { title: "Returns" };
export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string; hold?: string }>;
}) {
  const sp = await searchParams;
  let authorizedMessages: Awaited<ReturnType<typeof listHoldMessages>> = [];
  if (sp.hold) {
    const principal = await getCurrentUser();
    if (!principal || principal.role !== "SELLER") notFound();
    try {
      authorizedMessages = await listHoldMessages(principal.id, sp.hold);
    } catch (error) {
      if (error instanceof HoldError) notFound();
      throw error;
    }
  }
  const user = await requireFactory("returns");
  await escalateOverdue();
  const rows = await factoryReturns(user.id);
  const selected = sp.return;
  const owner = user.factoryRole === "OWNER";
  const faults = owner ? await factoryFaults(user.id) : null;
  const hold = sp.hold ? faults?.holds.find((h) => h.id === sp.hold) : null;
  if (sp.hold && !hold) notFound();
  const holdMessages = authorizedMessages;
  if (selected && !rows.some((r) => r.id === selected)) notFound();
  const messages = selected ? await listReturnMessages(user.id, selected) : [];
  return (
    <FactoryShell title="Returns" active="returns" role={user.factoryRole}>
      <div className="flex flex-col gap-4">
        {faults && (
          <>
            {faults.holds.some((h) => !h.decidedAt) && (
              <Card>
                <h2 className="font-semibold">Your shop is on hold</h2>
              </Card>
            )}
            <section>
              <h2 className="mb-3 text-lg font-semibold">Faults</h2>
              <FaultList faults={faults.faults} />
            </section>
            {faults.holds.map((h) => (
              <Card key={h.id} className="flex min-w-0 flex-col gap-3">
                <h2 className="font-semibold">Hold</h2>
                <Badge>{h.decision ?? "On hold"}</Badge>
                {h.decisionNote && <p>{h.decisionNote}</p>}
                <LinkButton href={`/seller/returns?hold=${h.id}`} variant="secondary">
                  Hold messages
                </LinkButton>
                {hold?.id === h.id && (
                  <HoldThread id={h.id} messages={holdMessages} canPost={!h.decidedAt} />
                )}
              </Card>
            ))}
          </>
        )}
        {!rows.length && <EmptyState title="No returns" />}
        {rows.map((r) => (
          <ReturnCard
            key={r.id}
            request={r}
            viewer="factory"
            threadHref={selected === r.id ? undefined : `/seller/returns?return=${r.id}`}
          >
            {selected === r.id && (
              <ReturnThread id={r.id} messages={messages} canPost={r.status === "WITH_ADMIN"} />
            )}
          </ReturnCard>
        ))}
      </div>
    </FactoryShell>
  );
}
