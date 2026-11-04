import Link from "next/link";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { PartnerForm } from "@/components/partner-form";
import { requireAnyAdmin } from "@/server/auth/session";
import { assertPartnerAdmin } from "@/server/partners";
import { db } from "@/server/db";
import { createInviteAction } from "@/server/partner-actions";
import { formatDateTime } from "@/lib/format";
export default async function ApplicationsPage() {
  const admin = await requireAnyAdmin();
  await assertPartnerAdmin(admin.id);
  const applications = await db.factoryApplication.findMany({
    select: { id: true, businessName: true, status: true, createdAt: true },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Factory applications" />
      <div className="grid gap-4">
        <Card>
          <h2 className="mb-3 font-semibold">Invite factory</h2>
          <PartnerForm action={createInviteAction} submit="Create invite">
            <Field name="email" label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field name="phone" label="Phone">
              <Input name="phone" type="tel" />
            </Field>
          </PartnerForm>
        </Card>
        {applications.map((a) => (
          <Link
            key={a.id}
            className="rounded-xl border border-line p-4"
            href={`/admin/factory/applications/${a.id}`}
          >
            <strong className="break-words">{a.businessName}</strong>
            <div className="text-sm">
              {a.status} | {formatDateTime(a.createdAt)}
            </div>
          </Link>
        ))}
        {!applications.length && <Card>No applications</Card>}
      </div>
    </div>
  );
}
