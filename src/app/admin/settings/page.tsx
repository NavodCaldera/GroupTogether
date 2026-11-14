import { PartnerForm } from "@/components/partner-form";
import { publishAgreementAction } from "@/server/agreement-actions";
import { latestAgreement } from "@/server/agreements";
import { Textarea } from "@/components/ui";
import type { Metadata } from "next";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { setCommissionAction } from "@/server/admin-actions";
import { redirect } from "next/navigation";
import { adminHome } from "@/lib/admin-access";
import { requireAnyAdmin } from "@/server/auth/session";
import { appUrl } from "@/server/notify";
import { getSettings } from "@/server/settings";
import { storageDir } from "@/server/storage/local";
import { AdminForm } from "../admin-form";
import { saveAgentSettingsAction } from "../core/actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // The core admin owns every setting (product owner, 2026-11-03).
  const admin = await requireAnyAdmin();
  if (admin.adminArea !== "CORE") redirect(adminHome(admin.adminArea));
  const [s, agreement] = await Promise.all([getSettings(), latestAgreement()]);
  const system: [string, string, boolean][] = [
    [
      "Deadline sweep",
      process.env.CRON_SECRET ? "Cron endpoint enabled" : "Not running (no CRON_SECRET)",
      Boolean(process.env.CRON_SECRET),
    ],
    ["Site address", appUrl(), Boolean(process.env.APP_URL)],
    ["Uploads folder", storageDir(), true],
  ];
  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <PageHeader title="Settings" />
        <div className="flex flex-col gap-6">
          <Card>
            <AdminForm action={setCommissionAction} submit="Save commission">
              <Field label="Commission per piece (LKR)" name="commissionPerPiece">
                <Input
                  name="commissionPerPiece"
                  inputMode="decimal"
                  defaultValue={s.commissionPerPiece.toString()}
                  required
                />
              </Field>
            </AdminForm>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Agents and orders</h2>
            <AdminForm action={saveAgentSettingsAction} submit="Save">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["Agent fee (%)", "agentFeePercent", s.agentFeeRate.times(100), "decimal"],
                    ["Gateway fee rate", "gatewayFeeRate", s.gatewayFeeRate, "decimal"],
                    ["Basket lock amount (LKR)", "basketLockAmount", s.basketLockAmount, "decimal"],
                    ["Agent deposit (LKR)", "agentDeposit", s.agentDeposit, "decimal"],
                    ["Basket max wait (days)", "maxWaitDays", s.maxWaitDays, "numeric"],
                    [
                      "Payment hold (minutes)",
                      "paymentHoldMinutes",
                      s.paymentHoldMinutes,
                      "numeric",
                    ],
                    ["Collect before payout (hours)", "collectHours", s.collectHours, "numeric"],
                    [
                      "Return handover (days)",
                      "returnHandoverDays",
                      s.returnHandoverDays,
                      "numeric",
                    ],
                    [
                      "Buyer return handover (days)",
                      "buyerHandoverDays",
                      s.buyerHandoverDays,
                      "numeric",
                    ],
                    ["Agent radius (m)", "agentRadiusM", s.agentRadiusM, "numeric"],
                    ["Gap between agents (m)", "agentGapM", s.agentGapM, "numeric"],
                  ] as const
                ).map(([label, name, value, mode]) => (
                  <Field key={name} label={label} name={name}>
                    <Input name={name} inputMode={mode} defaultValue={value.toString()} required />
                  </Field>
                ))}
              </div>
            </AdminForm>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">
              Factory agreement{agreement ? ` v${agreement.version}` : ""}
            </h2>
            {agreement && (
              <div className="mb-4 break-words whitespace-pre-wrap">{agreement.text}</div>
            )}
            <PartnerForm action={publishAgreementAction} submit="Publish agreement">
              <Field name="text" label="New agreement text">
                <Textarea name="text" maxLength={100000} required />
              </Field>
            </PartnerForm>
          </Card>
        </div>
      </div>
      <aside className="flex flex-col gap-4 lg:pt-14">
        <Card className="text-sm">
          <h2 className="mb-2 font-semibold">System</h2>
          <dl className="flex flex-col gap-2">
            {system.map(([k, v, ok]) => (
              <div key={k}>
                <dt className="text-xs text-subtle">{k}</dt>
                <dd className={`break-words ${ok ? "" : "text-danger"}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </aside>
    </div>
  );
}
