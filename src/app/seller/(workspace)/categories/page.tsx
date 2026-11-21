import type { Metadata } from "next";
import { AdminForm } from "@/app/admin/admin-form";
import { Badge, Field, Input, Select } from "@/components/ui";
import { categoryLabel, isActive } from "@/lib/categories";
import { coveredBy } from "@/lib/factory-categories";
import { DOCUMENT_LABELS, WORKSPACE_DOCUMENTS } from "@/lib/partner-rules";
import { requireFactory } from "@/server/auth/session";
import { loadCategoryTree } from "@/server/categories";
import { factoryCategoryView } from "@/server/factory-categories";
import {
  requestCategoryAction,
  uploadFactoryDocumentAction,
} from "@/server/factory-category-actions";
import { FactoryShell } from "@/app/seller/factory-bits";

export const metadata: Metadata = { title: "Categories" };

const STATUS = {
  APPROVED: { tone: "good", label: "Approved" },
  PENDING: { tone: "info", label: "Waiting" },
  REJECTED: { tone: "bad", label: "Not approved" },
} as const;

/** The categories this factory may list in, its requests and its licence documents (CATG-003). */
export default async function FactoryCategoriesPage() {
  const me = await requireFactory("products");
  const [tree, view] = await Promise.all([loadCategoryTree(), factoryCategoryView(me.factoryId)]);
  const approved = view.requests.filter((r) => r.status === "APPROVED").map((r) => r.categoryId);
  const pending = new Set(
    view.requests.filter((r) => r.status === "PENDING").map((r) => r.categoryId),
  );
  const choices = [...tree.values()]
    .filter((n) => isActive(tree, n.id) && !coveredBy(tree, approved, n.id) && !pending.has(n.id))
    .map((n) => ({ id: n.id, label: categoryLabel(tree, n.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <FactoryShell active="products" role={me.factoryRole} title="Categories">
      <ul className="mb-6 flex flex-col divide-y-2 divide-dashed divide-line border-y-2 border-ink">
        {view.requests.map((r) => (
          <li
            key={r.id}
            aria-label={r.label}
            className="flex items-baseline justify-between gap-2 py-3"
          >
            <span className="min-w-0 font-bold break-words">{r.label}</span>
            <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
          </li>
        ))}
      </ul>
      {choices.length > 0 && (
        <section aria-labelledby="ask" className="mb-6">
          <h2 id="ask" className="mb-2 text-lg font-bold">
            Ask for a category
          </h2>
          <AdminForm action={requestCategoryAction} submit="Ask">
            <Field name="categoryId" label="Category">
              <Select name="categoryId" id="categoryId" required defaultValue="">
                <option value="" disabled>
                  Choose
                </option>
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </AdminForm>
        </section>
      )}
      <section aria-labelledby="docs">
        <h2 id="docs" className="mb-2 text-lg font-bold">
          Documents
        </h2>
        {view.documents.length > 0 && (
          <ul className="mb-3 flex flex-col divide-y-2 divide-dashed divide-line">
            {view.documents.map((d) => (
              <li key={d.id} className="flex items-baseline justify-between gap-2 py-2">
                <span>
                  {DOCUMENT_LABELS[d.kind]}{" "}
                  <span className="text-sm text-subtle">
                    {d.createdAt.toLocaleDateString("en-LK")}
                  </span>
                </span>
                <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
        <AdminForm action={uploadFactoryDocumentAction} submit="Send">
          <Field name="kind" label="Document">
            <Select name="kind" id="kind" required>
              {WORKSPACE_DOCUMENTS.map((k) => (
                <option key={k} value={k}>
                  {DOCUMENT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field name="file" label="File">
            <Input
              id="file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
              className="w-full min-w-0 py-2"
            />
          </Field>
        </AdminForm>
      </section>
    </FactoryShell>
  );
}
