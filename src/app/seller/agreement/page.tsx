import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { PartnerForm } from "@/components/partner-form";
import { requireSeller } from "@/server/auth/session";
import { latestAgreement } from "@/server/agreements";
import { acceptAgreementAction } from "@/server/agreement-actions";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";
export default async function AgreementPage() {
  const user = await requireSeller();
  const me = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      isBrand: true,
      factoryId: true,
      factoryProfile: { select: { status: true, complianceDueAt: true } },
    },
  });
  if (me.isBrand || me.factoryId) redirect("/seller");
  const [latest, acceptance, application] = await Promise.all([
    latestAgreement(),
    db.agreementAcceptance.findFirst({
      where: { factoryUserId: user.id },
      orderBy: { acceptedAt: "desc" },
      select: { acceptedAt: true, endsAt: true, version: { select: { version: true } } },
    }),
    db.factoryApplication.findFirst({
      where: { factoryUserId: user.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
  ]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Factory agreement" />
      <div className="grid gap-4">
        <Card>
          <h2 className="mb-3 font-semibold">Factory checks</h2>
          <div>{application?.status ?? "Not submitted"}</div>
          {!application && (
            <Link className="inline-flex min-h-11 items-center underline" href="/factories/apply">
              Submit factory checks
            </Link>
          )}
          {me.factoryProfile?.complianceDueAt && (
            <div>Compliance due: {formatDateTime(me.factoryProfile.complianceDueAt)}</div>
          )}
        </Card>
        {acceptance && (
          <Card>
            <dl>
              <dt>Accepted version</dt>
              <dd>{acceptance.version.version}</dd>
              <dt>Accepted</dt>
              <dd>{formatDateTime(acceptance.acceptedAt)}</dd>
              <dt>Ends</dt>
              <dd>{formatDateTime(acceptance.endsAt)}</dd>
            </dl>
          </Card>
        )}
        {latest ? (
          <Card>
            <h2 className="mb-3 font-semibold">Agreement v{latest.version}</h2>
            <div className="mb-5 break-words whitespace-pre-wrap">{latest.text}</div>
            {me.factoryProfile?.status === "ACTIVE" && (
              <PartnerForm action={acceptAgreementAction} submit="Accept agreement">
                <input type="hidden" name="versionId" value={latest.id} />
                <label htmlFor="agree" className="flex min-h-11 items-center gap-3 font-bold">
                  <input
                    id="agree"
                    name="agree"
                    type="checkbox"
                    required
                    className="size-5 shrink-0 accent-accent"
                  />
                  I accept this agreement
                </label>
              </PartnerForm>
            )}
          </Card>
        ) : (
          <Card>No agreement published</Card>
        )}
      </div>
    </div>
  );
}
