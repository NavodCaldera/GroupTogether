import Link from "next/link";
import type { ReactNode } from "react";
import { FitModule } from "@/components/fit/fit-module";
import { Card } from "@/components/ui";
import { REGION_LABEL } from "@/lib/fit/regions";
import type { FitView } from "@/server/fit";

/** Fit and material for a product page (DEC-020, DEC-022). Shows nothing when the factory gave no data. */
export function FitSection({
  view,
  productId,
  buyer,
  materialCard,
}: {
  view: FitView;
  productId: string;
  buyer: boolean;
  /** The Material Card (DEC-022); when there is one it replaces the stretch and care panel */
  materialCard?: ReactNode;
}) {
  const { material, chart, report } = view;
  if (!material && !chart && !materialCard) return null;
  const fitHref = `/account/fit?next=${encodeURIComponent(`/products/${productId}`)}`;
  const fitted = report?.recommendedSize ? report : null;
  return (
    <section className="mt-8 flex flex-col gap-4" aria-labelledby="fit-title">
      <h2 id="fit-title" className="text-lg font-semibold">
        Fit
      </h2>
      {chart && fitted && (
        <Card>
          <FitModule
            report={fitted}
            assets={view.assets}
            body={view.body}
            deepFit={view.deepFit}
            productId={productId}
          />
        </Card>
      )}
      {chart && !fitted && buyer && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">
            {view.hasProfile ? "Add measurements for this garment" : "Get your fit report"}
          </p>
          <Link
            href={fitHref}
            className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper sm:min-h-10"
          >
            {view.hasProfile ? "Edit measurements" : "Measure me"}
          </Link>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
        {chart && (
          <Card>
            <h3 className="mb-2 font-semibold">Size chart (cm)</h3>
            <div
              className="-mx-1 overflow-x-auto px-1"
              role="region"
              aria-label="Size chart (cm)"
              tabIndex={0}
            >
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-subtle">
                    <th scope="col" className="py-1 pr-2 font-normal">
                      Size
                    </th>
                    {chart.regions.map((r) => (
                      <th key={r} scope="col" className="px-1 py-1 text-right font-normal">
                        {REGION_LABEL[r]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.sizes.map((s) => (
                    <tr key={s} className="border-t border-line">
                      <th scope="row" className="py-1 pr-2 text-left font-medium">
                        {s}
                      </th>
                      {chart.regions.map((r) => (
                        <td key={r} className="px-1 py-1 text-right">
                          {chart.cells[s]?.[r] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {materialCard ?? (material && <MaterialPanel material={material} />)}
      </div>
    </section>
  );
}

function MaterialPanel({ material: m }: { material: NonNullable<FitView["material"]> }) {
  return (
    <Card>
      <h3 className="mb-2 font-semibold">Material</h3>
      <ul className="flex flex-col gap-1 text-sm">
        {m.stretchPct !== null && (
          <li>{m.stretchPct ? `${m.stretchPct}% stretch` : "No stretch"}</li>
        )}
        {m.careNotes && <li className="whitespace-pre-line text-subtle">{m.careNotes}</li>}
      </ul>
    </Card>
  );
}
