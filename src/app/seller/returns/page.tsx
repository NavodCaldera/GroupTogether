import { requireFactory } from "@/server/auth/session";
import { factoryReturns, escalateOverdue } from "@/server/returns";
import { FactoryShell } from "../factory-bits";
import { ReturnCard } from "@/components/return-card";
import { EmptyState } from "@/components/ui";
export const metadata = { title: "Returns" };
export default async function ReturnsPage() {
  const user = await requireFactory("returns");
  await escalateOverdue();
  const rows = await factoryReturns(user.id);
  return (
    <FactoryShell title="Returns" active="returns" role={user.factoryRole}>
      <div className="flex flex-col gap-4">
        {!rows.length && <EmptyState title="No returns" />}
        {rows.map((r) => (
          <ReturnCard key={r.id} request={r} viewer="factory" />
        ))}
      </div>
    </FactoryShell>
  );
}
