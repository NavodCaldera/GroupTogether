import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { PartnerForm } from "@/components/partner-form";
import { APPLICATION_FIELDS, DOCUMENT_LABELS, bankNameMatches } from "@/lib/partner-rules";
import { requireAnyAdmin } from "@/server/auth/session";
import { assertPartnerAdmin } from "@/server/partners";
import { reviewApplicationAction, recordVisitAction } from "@/server/partner-actions";
import { db } from "@/server/db";
import { appUrl } from "@/server/notify";
import { formatDateTime } from "@/lib/format";
export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAnyAdmin();
  await assertPartnerAdmin(admin.id);
  const a = await db.factoryApplication.findUnique({
    where: { id: (await params).id },
    include: { documents: { select: { id: true, kind: true } } },
  });
  if (!a) notFound();
  const signIn =
    a.status === "APPROVED" && a.factoryUserId
      ? await db.notification.findFirst({
          where: {
            userId: a.factoryUserId,
            title: "Factory application approved",
            href: { startsWith: "/factories/sign-in/" },
          },
          select: { href: true },
          orderBy: { createdAt: "desc" },
        })
      : null;
  const match = bankNameMatches(a.accountName, a.businessName, a.ownerName);
  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/factory/applications"
        className="mb-4 inline-flex min-h-11 items-center underline"
      >
        Back to applications
      </Link>
      <PageHeader title={a.businessName} />
      <div className="grid gap-4">
        {signIn?.href && (
          <Card>
            <Field name="signInLink" label="Sign-in link">
              <Input
                name="signInLink"
                readOnly
                value={appUrl(signIn.href)}
                className="w-full min-w-0"
              />
            </Field>
          </Card>
        )}
        <Card>
          <dl className="grid gap-3">
            {APPLICATION_FIELDS.map(([key, label]) => (
              <div key={key}>
                <dt className="text-sm text-subtle">{label}</dt>
                <dd className="break-words">{a[key]}</dd>
              </div>
            ))}
            <div>
              <dt>Status</dt>
              <dd>{a.status}</dd>
            </div>
            <div>
              <dt>Bank name match</dt>
              <dd>{match ? "Matched" : "Mismatch"}</dd>
            </div>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Documents</h2>
          <div className="flex flex-wrap gap-4">
            {a.documents.map((d, i) => (
              <a
                className="inline-flex min-h-11 items-center underline"
                key={d.id}
                href={`/api/partner-docs/${d.id}`}
              >
                {DOCUMENT_LABELS[d.kind]} {i + 1}
              </a>
            ))}
          </div>
        </Card>
        {a.visitDate && (
          <Card>
            <h2 className="font-semibold">Factory visit</h2>
            <div>{formatDateTime(a.visitDate)}</div>
            <div className="break-words whitespace-pre-wrap">{a.visitNotes}</div>
          </Card>
        )}
        {a.reviewNote && <Card>{a.reviewNote}</Card>}
        {a.status === "WAITING" && (
          <>
            <Card>
              <PartnerForm action={recordVisitAction} submit="Record visit">
                <input type="hidden" name="id" value={a.id} />
                <Field name="date" label="Visit date">
                  <Input name="date" type="date" required />
                </Field>
                <Field name="notes" label="Visit notes">
                  <Textarea name="notes" maxLength={2000} required />
                </Field>
              </PartnerForm>
            </Card>
            <Card>
              <PartnerForm action={reviewApplicationAction} submit="Save decision">
                <input type="hidden" name="id" value={a.id} />
                <Field name="decision" label="Decision">
                  <Select name="decision" required>
                    <option value="">Choose</option>
                    <option value="APPROVE" disabled={!match}>
                      Approve
                    </option>
                    <option value="REJECT">Reject</option>
                  </Select>
                </Field>
                <Field name="note" label="Review note">
                  <Textarea name="note" maxLength={2000} />
                </Field>
              </PartnerForm>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
