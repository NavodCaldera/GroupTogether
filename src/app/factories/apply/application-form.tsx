import { APPLICATION_FIELDS, DOCUMENT_LABELS, REQUIRED_DOCUMENTS } from "@/lib/partner-rules";
import type { FactoryDocKind } from "@/generated/prisma/client";
import { PartnerForm } from "@/components/partner-form";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { childrenOf } from "@/lib/categories";
import { loadCategoryTree } from "@/server/categories";
import { submitApplicationAction } from "@/server/partner-actions";
export async function ApplicationForm({ token }: { token?: string }) {
  const roots = childrenOf(await loadCategoryTree(), null);
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
          <Field name="industryId" label="Main category">
            <Select name="industryId" id="industryId" defaultValue="">
              <option value="">Choose</option>
              {roots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          {Object.entries(DOCUMENT_LABELS).map(([kind, label]) => (
            <Field key={kind} name={kind} label={label}>
              <Input
                className="w-full min-w-0 py-2"
                name={kind}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple={kind === "FACTORY_PHOTO"}
                required={REQUIRED_DOCUMENTS.includes(kind as FactoryDocKind)}
              />
            </Field>
          ))}
        </PartnerForm>
      </Card>
    </div>
  );
}
