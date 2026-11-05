import { requireFactory } from "@/server/auth/session";
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
  searchParams: Promise<{ return?: string }>;
}) {
  const user = await requireFactory("returns");
  await escalateOverdue();
  const rows = await factoryReturns(user.id);
  const selected = (await searchParams).return;
  if (selected && !rows.some((r) => r.id === selected)) notFound();
  const messages = selected ? await listReturnMessages(user.id, selected) : [];
  return (
    <FactoryShell title="Returns" active="returns" role={user.factoryRole}>
      <div className="flex flex-col gap-4">
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
