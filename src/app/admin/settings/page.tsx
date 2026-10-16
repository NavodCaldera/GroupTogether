import type { Metadata } from "next";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { saveSettingsAction, testEmailAction } from "@/server/admin-actions";
import { requireAdmin } from "@/server/auth/session";
import { deliveryProvider } from "@/server/delivery/provider";
import { appUrl } from "@/server/notify";
import { mailer } from "@/server/notify/mailer";
import { getSettings } from "@/server/settings";
import { storageDir } from "@/server/storage/local";
import { AdminForm } from "../admin-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const s = await getSettings();
  const system: [string, string, boolean][] = [
    [
      "Email",
      configured(() => (mailer().name === "gmail" ? "Gmail SMTP" : "Mock (not sent)")),
      mailerSends(),
    ],
    [
      "Delivery",
      configured(() =>
        deliveryProvider().name === "pickme"
          ? "PickMe API"
          : "Manual (admin books in the PickMe app)",
      ),
      true,
    ],
    [
      "Deadline sweep",
      process.env.CRON_SECRET
        ? "Cron endpoint enabled, and on page loads"
        : "On page loads only (no CRON_SECRET)",
      true,
    ],
    ["Site address", appUrl(), Boolean(process.env.APP_URL)],
    ["Uploads folder", storageDir(), true],
  ];
  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div>
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
      <aside className="flex flex-col gap-4 lg:pt-14">
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">System</h2>
          <dl className="flex flex-col gap-2">
            {system.map(([k, v, ok]) => (
              <div key={k}>
                <dt className="text-xs text-subtle">{k}</dt>
                <dd className={`break-words ${ok ? "" : "text-warn"}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-subtle">Set these in the server environment (.env).</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Test email</h2>
          <AdminForm action={testEmailAction} submit="Send me a test email" variant="secondary">
            <p className="text-xs text-subtle">
              Sends to your admin email with the current mailer.
            </p>
          </AdminForm>
        </Card>
      </aside>
    </div>
  );
}

/** A setting's description, or the configuration error that stops it working. */
function configured(describe: () => string): string {
  try {
    return describe();
  } catch (e) {
    return `Not working: ${(e as Error).message}`;
  }
}

function mailerSends() {
  try {
    return mailer().name === "gmail";
  } catch {
    return false;
  }
}
