import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackLink } from "@/components/client";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { adminHome } from "@/lib/admin-access";
import { createSellerAction } from "@/server/admin-actions";
import { requireAnyAdmin } from "@/server/auth/session";
import { AdminForm } from "../../admin-form";

export const metadata: Metadata = { title: "Add factory seller or brand" };

/** Factory admins add factory sellers; premium admins add brands (with their website). */
export default async function NewSellerPage() {
  const admin = await requireAnyAdmin();
  if (admin.adminArea !== "PREMIUM" && admin.adminArea !== "FACTORY")
    redirect(adminHome(admin.adminArea));
  const brand = admin.adminArea === "PREMIUM";
  return (
    <div className="max-w-xl">
      <BackLink fallback="/admin/users" />
      <PageHeader title={brand ? "Add a premium brand" : "Add a factory seller"} />
      <Card>
        <AdminForm
          action={createSellerAction}
          submit={brand ? "Create brand account" : "Create seller account"}
        >
          {brand && (
            <Field label="Website" name="website">
              <Input name="website" type="url" placeholder="https://www.brand.lk" required />
            </Field>
          )}
          <Field label={brand ? "Brand name" : "Factory or company name"} name="company">
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
