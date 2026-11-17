import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm } from "@/app/admin/admin-form";
import { param, SearchForm, Table } from "@/app/admin/list-bits";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { publishMaterialAction } from "@/server/material-actions";
import { listMaterials } from "@/server/materials";
import { MaterialsNav } from "./materials-nav";

export const metadata: Metadata = { title: "Materials" };

/** The material library (DEC-022): factories can pick only published materials. */
export default async function MaterialsAdminPage({
  searchParams,
}: PageProps<"/admin/factory/materials">) {
  await requireAdmin("FACTORY");
  const sp = await searchParams;
  const q = param(sp, "q");
  const materials = await listMaterials({ q });
  return (
    <>
      <PageHeader title="Materials" />
      <MaterialsNav active="Materials" />
      <SearchForm action="/admin/factory/materials" q={q} placeholder="Search materials" />
      {materials.length ? (
        <Table
          head={
            <>
              <th>Material</th>
              <th>Construction</th>
              <th>GSM</th>
              <th>Status</th>
              <th />
            </>
          }
        >
          {materials.map((m) => (
            <tr key={m.code}>
              <td>
                <Link href={`/admin/factory/materials/${m.code}`} className="font-medium underline">
                  {m.displayName}
                </Link>
              </td>
              <td>{m.construction.name}</td>
              <td className="tabular-nums">
                {m.defaultGsmMin != null ? `${m.defaultGsmMin}–${m.defaultGsmMax}` : "—"}
              </td>
              <td>
                <Badge tone={m.status === "PUBLISHED" ? "good" : "neutral"}>
                  {m.status === "PUBLISHED" ? "Published" : "Draft"}
                </Badge>
              </td>
              <td>
                <AdminForm
                  action={publishMaterialAction}
                  submit={m.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                  variant="secondary"
                  className="flex"
                >
                  <input type="hidden" name="code" value={m.code} />
                  <input
                    type="hidden"
                    name="publish"
                    value={m.status === "PUBLISHED" ? "0" : "1"}
                  />
                </AdminForm>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <EmptyState title="No materials">
          <p className="text-sm text-subtle">npm run materials:load</p>
        </EmptyState>
      )}
    </>
  );
}
