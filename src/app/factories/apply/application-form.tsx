import { APPLICATION_FIELDS, DOCUMENT_LABELS } from "@/lib/partner-rules";
import { PartnerForm } from "@/components/partner-form";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { submitApplicationAction } from "@/server/partner-actions";
export function ApplicationForm({ token }: { token?: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Factory application" />
      <Card>
        <PartnerForm action={submitApplicationAction} submit="Submit application">
          {token && <input type="hidden" name="inviteToken" value={token} />}
          {APPLICATION_FIELDS.map(([name, label]) => (
            <Field key={name} name={name} label={label}>
              <Input
                name={name}
                type={name === "email" ? "email" : name === "phone" ? "tel" : "text"}
                maxLength={500}
                required
              />
            </Field>
          ))}
          {Object.entries(DOCUMENT_LABELS).map(([kind, label]) => (
            <Field key={kind} name={kind} label={label}>
              <Input
                className="w-full min-w-0 py-2"
                name={kind}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={kind === "FACTORY_PHOTO"}
                required
              />
            </Field>
          ))}
        </PartnerForm>
      </Card>
    </div>
  );
}
