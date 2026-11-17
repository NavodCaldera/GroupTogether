import { AdminForm } from "@/app/admin/admin-form";
import { MaterialCardView } from "@/components/materials/material-card-view";
import { MaterialFields } from "@/components/materials/material-fields";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import { BADGE_LABEL } from "@/lib/materials/card";
import { kindKey, MEASURE_KINDS } from "@/lib/materials/measure";
import {
  addMeasurementAction,
  deleteMeasurementAction,
  saveMaterialVideoAction,
  saveProductMaterialAction,
} from "@/server/material-actions";
import {
  getMaterialCard,
  getProductMaterial,
  libraryComposition,
  listMaterials,
  materialFormOptions,
  readComposition,
} from "@/server/materials";

/** The factory's Material card on its product page (DEC-022) */
export async function MaterialSection({ productId }: { productId: string }) {
  const [materials, options, pm, card] = await Promise.all([
    listMaterials({ status: "PUBLISHED" }),
    materialFormOptions(),
    getProductMaterial(productId),
    getMaterialCard(productId),
  ]);
  const picker = materials.map((m) => ({
    code: m.code,
    displayName: m.displayName,
    construction: m.construction.name,
    category: m.construction.category,
    gsm:
      m.defaultGsmMin != null && m.defaultGsmMax != null
        ? ([m.defaultGsmMin, m.defaultGsmMax] as [number, number])
        : null,
    fibers: libraryComposition(m),
  }));
  const current = pm
    ? {
        materialCode: pm.material.code,
        gsm: pm.actualGsm,
        composition: readComposition(pm.actualComposition) ?? libraryComposition(pm.material),
      }
    : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card className="mt-6" data-testid="factory-material">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Material</h2>
        <div className="flex gap-2">
          {pm?.needsReviewAt && <Badge tone="neutral">Waiting for check</Badge>}
          {pm && <Badge tone="info">{BADGE_LABEL[pm.verificationLevel]}</Badge>}
        </div>
      </div>
      <AdminForm action={saveProductMaterialAction} submit="Save material">
        <input type="hidden" name="productId" value={productId} />
        <MaterialFields
          materials={picker}
          fibers={options.fibers}
          standards={options.standards}
          current={current}
        />
      </AdminForm>

      {pm && (
        <>
          <h3 className="mt-6 mb-2 font-semibold">Lab results</h3>
          {pm.measurements.length > 0 && (
            <ul className="mb-3 flex flex-col gap-2 text-sm">
              {pm.measurements.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
                >
                  <span className="min-w-0">
                    {m.testStandard.replace(/_/g, " ")}: {m.value} {m.unit} · {m.labName}
                    {m.reportKey && (
                      <>
                        {" · "}
                        <a href={`/api/lab-reports/${m.id}`} className="text-accent underline">
                          Report
                        </a>
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={m.accredited ? "good" : "neutral"}>
                      {m.accredited ? "Accredited" : "Not accredited"}
                    </Badge>
                    <AdminForm
                      action={deleteMeasurementAction}
                      submit="Remove"
                      variant="secondary"
                      className="flex"
                    >
                      <input type="hidden" name="productId" value={productId} />
                      <input type="hidden" name="measurementId" value={m.id} />
                    </AdminForm>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <details className="rounded-lg border border-line p-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium sm:min-h-10">
              Add a lab result
            </summary>
            <AdminForm
              action={addMeasurementAction}
              submit="Add result"
              className="mt-2 flex flex-col gap-3"
            >
              <input type="hidden" name="productId" value={productId} />
              <Field label="Test" name="kind">
                <Select name="kind" required defaultValue="">
                  <option value="" disabled>
                    Choose
                  </option>
                  {MEASURE_KINDS.map((k) => (
                    <option key={kindKey(k)} value={kindKey(k)}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Result" name="value">
                  <Input name="value" inputMode="decimal" required />
                </Field>
                <Field label="Tested on" name="testedOn">
                  <Input name="testedOn" type="date" max={today} required />
                </Field>
              </div>
              <Field label="Lab" name="lab">
                <Select name="lab" defaultValue="">
                  <option value="">Another lab</option>
                  {options.labs.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                      {l.city ? `, ${l.city}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Other lab name" name="labName">
                  <Input name="labName" />
                </Field>
                <Field label="Accreditation no." name="accreditationNo">
                  <Input name="accreditationNo" />
                </Field>
              </div>
              <Field label="Report no." name="reportRef">
                <Input name="reportRef" />
              </Field>
              <Field label="Report (PDF, up to 10 MB)" name="report">
                <Input name="report" type="file" accept="application/pdf" className="py-2" />
              </Field>
            </AdminForm>
          </details>

          <h3 className="mt-6 mb-2 font-semibold">Video</h3>
          <AdminForm action={saveMaterialVideoAction} submit="Upload video">
            <input type="hidden" name="productId" value={productId} />
            <Field label="Video (MP4 or WebM, up to 30 MB)" name="video">
              <Input
                name="video"
                type="file"
                accept="video/mp4,video/webm"
                className="py-2"
                required
              />
            </Field>
          </AdminForm>
          {pm.videoKey && (
            <AdminForm
              action={saveMaterialVideoAction}
              submit="Remove video"
              variant="secondary"
              className="mt-2 flex"
            >
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="remove" value="1" />
            </AdminForm>
          )}
        </>
      )}

      {card && (
        <details className="mt-6 rounded-lg border border-line p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium sm:min-h-10">
            Buyer view
          </summary>
          <div className="mt-2">
            <MaterialCardView card={card} why={null} />
          </div>
        </details>
      )}
    </Card>
  );
}
