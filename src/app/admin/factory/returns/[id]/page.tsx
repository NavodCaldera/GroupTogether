import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { adminReturn, listReturnMessages, escalateOverdue } from "@/server/returns";
import { PageHeader } from "@/components/ui";
import { ReturnCard } from "@/components/return-card";
import { ReturnThread } from "@/components/return-thread";
export const metadata = { title: "Return" };
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["ADMIN"]);
  if (!["FACTORY", "CORE"].includes(user.adminArea ?? "")) notFound();
  const { id } = await params;
  await escalateOverdue();
  const r = await adminReturn(user.id, id);
  if (!r) notFound();
  const messages = await listReturnMessages(user.id, id);
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4">
      <PageHeader title="Return" />
      <ReturnCard request={r} viewer="admin" canChangeFault={user.adminArea === "FACTORY"}>
        <ReturnThread id={id} messages={messages} canPost={r.status === "WITH_ADMIN"} />
      </ReturnCard>
    </div>
  );
}
