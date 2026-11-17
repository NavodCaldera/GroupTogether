import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm } from "@/app/admin/admin-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { AXIS_TEXT } from "@/lib/materials/card";
import type { AxisKey } from "@/lib/materials/types";
import { requireAdmin } from "@/server/auth/session";
import { reviewProductMaterialAction } from "@/server/material-actions";
import { materialReports } from "@/server/material-admin";
import { readComposition } from "@/server/materials";
import { MaterialsNav } from "../materials-nav";

export const metadata: Metadata = { title: "Material reports" };

/** What waits for a Factory admin, and where the library is thin (DEC-022) */
export default async function MaterialReportsPage() {
  await requireAdmin("FACTORY");
  const r = await materialReports();
  return (
    <>
      <PageHeader title="Reports" />
      <MaterialsNav active="Reports" />
      <section aria-labelledby="to-check" className="mb-6 flex flex-col gap-2">
        <h2 id="to-check" className="text-lg font-semibold">
          To check
        </h2>
        {r.review.length ? (
          <Card>
            <ul className="flex flex-col divide-y divide-line text-sm">
              {r.review.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <Link href={`/products/${p.product.id}`} className="font-medium underline">
                      {p.product.title}
                    </Link>
                    <span className="block text-subtle">
                      {p.product.seller?.name} · {p.material.displayName}: {p.actualGsm} gsm
                      (library {p.material.defaultGsmMin ?? "—"}–{p.material.defaultGsmMax ?? "—"})
                      {readComposition(p.actualComposition)
                        ?.map((f) => ` · ${f.pct}% ${f.fiber}`)
                        .join("")}
                    </span>
                  </span>
                  <AdminForm
                    action={reviewProductMaterialAction}
                    submit="Checked"
                    variant="secondary"
                    className="flex"
                  >
                    <input type="hidden" name="productMaterialId" value={p.id} />
                  </AdminForm>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState title="Nothing to check" />
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <h2 className="mb-2 font-semibold">Sliders not yet measured</h2>
          {r.missing.length ? (
            <ul className="text-sm tabular-nums">
              {r.missing.map((m) => (
                <li key={m.axis}>
                  {AXIS_TEXT[m.axis as AxisKey].name}: {m._count} products
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">None</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Products on the library estimate only</h2>
          {r.estimates.length ? (
            <ul className="text-sm">
              {r.estimates.map((p) => (
                <li key={p.id}>
                  <Link href={`/products/${p.product.id}`} className="underline">
                    {p.product.title}
                  </Link>{" "}
                  · {p.material.displayName}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">None</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Evidence without a quote</h2>
          <p className="text-sm break-words">{r.unverified.join(", ") || "None"}</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Backed by tier C sources only</h2>
          <p className="text-sm break-words">{r.tierCOnly.join(", ") || "None"}</p>
        </Card>
      </div>
    </>
  );
}
