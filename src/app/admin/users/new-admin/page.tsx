import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ADMIN_AREAS, ADMIN_AREA_LABEL } from "@/lib/admin-access";
import { createOperationalAdminAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Add admin" };

export default async function NewAdminPage() {
  await requireAdmin("CORE");
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/users" />
      <PageHeader title="Add admin" />
      <Card>
        <AdminForm action={createOperationalAdminAction} submit="Create admin account">
          <Field label="Area" name="adminArea">
            <Select name="adminArea" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {ADMIN_AREAS.map((a) => (
                <option key={a} value={a}>
                  {ADMIN_AREA_LABEL[a]}
                </option>
              ))}
            </Select>
          </Field>
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
