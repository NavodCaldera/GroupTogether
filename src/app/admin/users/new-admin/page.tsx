import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { ADMIN_AREA_LABEL } from "@/lib/admin-access";
import { createOperationalAdminAction } from "@/server/admin-actions";
import { requireAnyAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Add admin" };

export default async function NewAdminPage() {
  const admin = await requireAnyAdmin();
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/users" />
      <PageHeader title={`Add ${ADMIN_AREA_LABEL[admin.adminArea].toLowerCase()} admin`} />
      <Card>
        <AdminForm action={createOperationalAdminAction} submit="Create admin account">
          <Field label="Name" name="name">
            <Input name="name" required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email (they sign in with this)" name="email">
              <Input name="email" type="email" autoComplete="off" required />
            </Field>
            <Field label="Mobile" name="phone">
              <Input name="phone" inputMode="tel" placeholder="0771234567" required />
            </Field>
          </div>
          <Field
            label="Temporary password"
            name="password"
            hint="At least 8 characters. Give it to them privately."
          >
            <Input name="password" type="text" minLength={8} autoComplete="off" required />
          </Field>
        </AdminForm>
      </Card>
    </div>
  );
}
