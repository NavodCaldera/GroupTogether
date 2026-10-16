import type { Metadata } from "next";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { saveSettingsAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { getSettings } from "@/server/settings";
import { AdminForm } from "../admin-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" />
      <Card>
        <AdminForm action={saveSettingsAction} submit="Save settings">
          <Field
            label="Minimum order value per cart (LKR)"
            name="minOrderValue"
            hint="Existing carts keep the minimum they started with."
          >
            <Input
              name="minOrderValue"
              inputMode="decimal"
              defaultValue={s.minOrderValue.toString()}
              required
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cart lifetime (hours)" name="cartLifetimeHours">
              <Input
                name="cartLifetimeHours"
                type="number"
                min={1}
                defaultValue={s.cartLifetimeHours}
                required
              />
            </Field>
            <Field label="Slip upload window (hours)" name="slipWindowHours">
              <Input
                name="slipWindowHours"
                type="number"
                min={1}
                defaultValue={s.slipWindowHours}
                required
              />
            </Field>
          </div>
          <p className="pt-2 text-sm font-bold">Bank account shown to cart owners</p>
          <Field label="Bank" name="bankName">
            <Input name="bankName" defaultValue={s.bankName} />
          </Field>
          <Field label="Branch" name="bankBranch">
            <Input name="bankBranch" defaultValue={s.bankBranch} />
          </Field>
          <Field label="Account name" name="accountName">
            <Input name="accountName" defaultValue={s.accountName} />
          </Field>
          <Field label="Account number" name="accountNumber">
            <Input name="accountNumber" defaultValue={s.accountNumber} />
          </Field>
        </AdminForm>
      </Card>
    </div>
  );
}
