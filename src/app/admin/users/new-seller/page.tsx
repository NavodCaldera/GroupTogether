import type { Metadata } from "next";
import { BackLink } from "@/components/client";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { createSellerAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Add factory seller" };

export default async function NewSellerPage() {
  await requireAdmin();
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/users" />
      <PageHeader
        title="Add a factory seller"
        description="Sellers list their stock for us to review and publish. They never see buyers or sales."
      />
      <Card>
        <AdminForm action={createSellerAction} submit="Create seller account">
          <Field label="Factory or company name" name="company">
            <Input name="company" required />
          </Field>
          <Field label="Contact person" name="name">
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
