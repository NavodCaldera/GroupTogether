import { AdminForm } from "@/app/admin/admin-form";
import { Field, Input, Textarea } from "@/components/ui";
import { kindRegions, readChart, sizeOrder } from "@/lib/fit/data";
import { REGION_LABEL } from "@/lib/fit/regions";
import { sizesFor } from "@/lib/taxonomy";
import type { FitState } from "@/server/fit-actions";

type FitProduct = {
  id: string;
  kind: string | null;
  sizeChart: unknown;
  fabricStretchPct: number | null;
  careNotes: string | null;
  variants: { size: string }[];
};

const cell =
  "min-h-11 w-full min-w-14 rounded-md border border-line bg-paper px-2 text-right text-base tabular-nums outline-none focus:border-ink sm:min-h-9 sm:text-sm";

/** Garment measurements per size (cm) and fabric details (DEC-020). */
export function FitDataForm({
  product,
  action,
  submit,
}: {
  product: FitProduct;
  action: (prev: FitState, fd: FormData) => Promise<FitState>;
  submit: string;
}) {
  const chart = readChart(product.sizeChart);
  const sizes = sizeOrder(product.kind, [
    ...sizesFor(product.kind ?? undefined),
    ...product.variants.map((v) => v.size),
    ...Object.keys(chart),
  ]);
  const regions = kindRegions(product.kind);
  const n = (v: number | null) => (v === null ? "" : String(v));
  return (
    <AdminForm action={action} submit={submit}>
      <input type="hidden" name="productId" value={product.id} />
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full text-sm">
          <caption className="mb-1 text-left font-medium">Garment measurements (cm)</caption>
          <thead>
            <tr className="text-left text-subtle">
              <th scope="col" className="py-1 pr-2 font-normal">
                Size
              </th>
              {regions.map((r) => (
                <th key={r} scope="col" className="px-1 py-1 text-right font-normal">
                  {REGION_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizes.map((s) => (
              <tr key={s}>
                <th scope="row" className="py-1 pr-2 text-left font-medium">
                  {s}
                </th>
                {regions.map((r) => (
                  <td key={r} className="px-1 py-1">
                    <input
                      name={`chart.${s}.${r}`}
                      inputMode="decimal"
                      aria-label={`${s} ${REGION_LABEL[r]} cm`}
                      defaultValue={chart[s]?.[r] ?? ""}
                      className={cell}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Stretch (%)" name="fabricStretchPct">
          <Input
            name="fabricStretchPct"
            inputMode="numeric"
            defaultValue={n(product.fabricStretchPct)}
          />
        </Field>
      </div>
      <Field label="Care" name="careNotes">
        <Textarea name="careNotes" rows={2} defaultValue={product.careNotes ?? ""} />
      </Field>
    </AdminForm>
  );
}
