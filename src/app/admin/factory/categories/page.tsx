import type { Metadata } from "next";
import { AdminForm } from "@/app/admin/admin-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DOCUMENT_LABELS } from "@/lib/partner-rules";
import { requireAdmin } from "@/server/auth/session";
import { pendingFactoryReviews } from "@/server/factory-categories";
import {
  reviewFactoryCategoryAction,
  reviewFactoryDocumentAction,
} from "@/server/factory-category-actions";

export const metadata: Metadata = { title: "Factory categories" };

function Decide({ id, action }: { id: string; action: typeof reviewFactoryCategoryAction }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <AdminForm action={action} submit="Approve">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="APPROVE" />
      </AdminForm>
      <AdminForm action={action} submit="Reject" variant="danger">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="decision" value="REJECT" />
      </AdminForm>
    </div>
  );
}

/** Factory category requests and licence documents waiting for review (CATG-003). */
export default async function FactoryCategoriesAdminPage() {
  const admin = await requireAdmin("FACTORY");
  const { requests, documents } = await pendingFactoryReviews(admin.id);
  return (
    <>
      <PageHeader title="Factory categories" />
      {requests.length === 0 && documents.length === 0 && <EmptyState title="Nothing waiting" />}
      {requests.length > 0 && (
        <section aria-labelledby="requests" className="mb-6">
          <h2 id="requests" className="mb-2 text-lg font-semibold">
            Categories
          </h2>
          <ul className="flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Card>
                  <p className="font-semibold break-words">{r.factory.company || r.factory.name}</p>
                  <p className="break-words">
                    {r.label} {r.needsLicence && <Badge tone="info">Licence</Badge>}
                  </p>
                  <Decide id={r.id} action={reviewFactoryCategoryAction} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {documents.length > 0 && (
        <section aria-labelledby="documents">
          <h2 id="documents" className="mb-2 text-lg font-semibold">
            Documents
          </h2>
          <ul className="flex flex-col gap-3">
            {documents.map((d) => (
              <li key={d.id}>
                <Card>
                  <p className="font-semibold break-words">
                    {d.factory?.company || d.factory?.name}
                  </p>
                  <a
                    href={`/api/partner-docs/${d.id}`}
                    className="font-semibold text-accent underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {DOCUMENT_LABELS[d.kind]}
                  </a>
                  <Decide id={d.id} action={reviewFactoryDocumentAction} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
