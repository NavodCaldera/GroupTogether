import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { adminReturns, escalateOverdue } from "@/server/returns";
import { ReturnCard } from "@/components/return-card";
import { PageHeader, EmptyState } from "@/components/ui";
import { AGENTS_AREA } from "@/lib/admin-access";
export const metadata = { title: "Returns" };
export default async function ReturnsPage() {
  const user = await requireUser(["ADMIN"]);
  if (!["FACTORY", "CORE", AGENTS_AREA].includes(user.adminArea ?? "")) notFound();
  await escalateOverdue();
  const rows = await adminReturns(user.id);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Returns" />
      {!rows.length && <EmptyState title="No returns" />}
      {rows.map((r) => (
        <ReturnCard
          key={r.id}
          request={r}
          viewer={user.adminArea === AGENTS_AREA ? "agents" : "admin"}
          threadHref={user.adminArea === AGENTS_AREA ? undefined : `/admin/factory/returns/${r.id}`}
          canChangeFault={user.adminArea === "FACTORY"}
        />
      ))}
    </div>
  );
}
