import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm } from "@/app/admin/admin-form";
import { BackLink } from "@/components/client";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { kindKey } from "@/lib/materials/measure";
import { requireAdmin } from "@/server/auth/session";
import {
  activateCalibrationSetAction,
  addCalibrationSwatchAction,
  addSwatchMeasurementAction,
  deleteSwatchMeasurementAction,
} from "@/server/material-actions";
import {
  getCalibrationSet,
  listLabs,
  MEASURED_KINDS,
  MIN_SWATCHES,
  swatchCoverage,
} from "@/server/material-admin";
import { listMaterials } from "@/server/materials";

export const metadata: Metadata = { title: "Reference swatch set" };

/** One reference swatch set: coverage per test, swatches and their lab results (DEC-022) */
export default async function CalibrationSetPage({
  params,
}: PageProps<"/admin/factory/materials/calibration/[set]">) {
  await requireAdmin("FACTORY");
  const code = (await params).set;
  const [set, materials, labs] = await Promise.all([
    getCalibrationSet(code),
    listMaterials({}),
    listLabs(),
  ]);
  if (!set) notFound();
  const coverage = swatchCoverage(set.swatches);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <BackLink fallback="/admin/factory/materials/calibration" />
      <PageHeader
        title={set.name}
        actions={
          <AdminForm
            action={activateCalibrationSetAction}
            submit={set.activeAt ? "Switch off" : "Make active"}
            variant="secondary"
            className="flex"
          >
            <input type="hidden" name="set" value={set.code} />
            <input type="hidden" name="active" value={set.activeAt ? "0" : "1"} />
          </AdminForm>
        }
      />
      <Card className="mb-6">
        <h2 className="mb-2 font-semibold">Accredited results per test</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2" data-testid="swatch-coverage">
          {coverage.map((c) => (
            <li key={kindKey(c)} className="flex items-center justify-between gap-2">
              <span className="min-w-0">{c.label}</span>
              <Badge tone={c.count >= MIN_SWATCHES ? "good" : "neutral"}>
                {c.count} of {MIN_SWATCHES}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {set.swatches.map((w) => (
          <Card key={w.id}>
            <h2 className="font-semibold">{w.label}</h2>
            <p className="mb-2 text-sm text-subtle">{w.material.displayName}</p>
            {w.measurements.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {w.measurements.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"
                  >
                    <span className="min-w-0">
                      {m.testStandard.replace(/_/g, " ")}: {m.value} {m.unit} · {m.labName}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={m.accredited ? "good" : "neutral"}>
                        {m.accredited ? "Accredited" : "Not accredited"}
                      </Badge>
                      <AdminForm
                        action={deleteSwatchMeasurementAction}
                        submit="Remove"
                        variant="secondary"
                        className="flex"
                      >
                        <input type="hidden" name="set" value={set.code} />
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
                action={addSwatchMeasurementAction}
                submit="Add result"
                className="mt-2 flex flex-col gap-3"
              >
                <input type="hidden" name="set" value={set.code} />
                <input type="hidden" name="swatchId" value={w.id} />
                <Field label="Test" name={`kind-${w.id}`}>
                  <Select id={`kind-${w.id}`} name="kind" required defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    {MEASURED_KINDS.map((k) => (
                      <option key={kindKey(k)} value={kindKey(k)}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Result" name={`value-${w.id}`}>
                    <Input id={`value-${w.id}`} name="value" inputMode="decimal" required />
                  </Field>
                  <Field label="Tested on" name={`testedOn-${w.id}`}>
                    <Input
                      id={`testedOn-${w.id}`}
                      name="testedOn"
                      type="date"
                      max={today}
                      required
                    />
                  </Field>
                </div>
                <Field label="Lab" name={`lab-${w.id}`}>
                  <Select id={`lab-${w.id}`} name="lab" required defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    {labs.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Report no." name={`ref-${w.id}`}>
                  <Input id={`ref-${w.id}`} name="reportRef" />
                </Field>
              </AdminForm>
            </details>
          </Card>
        ))}
      </div>

      <Card className="mt-6 max-w-md">
        <h2 className="mb-2 font-semibold">Add a swatch</h2>
        <AdminForm action={addCalibrationSwatchAction} submit="Add swatch">
          <input type="hidden" name="set" value={set.code} />
          <Field label="Material" name="material">
            <Select name="material" required defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {materials.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Label" name="label">
            <Input name="label" placeholder="R01 combed jersey 160" required />
          </Field>
        </AdminForm>
      </Card>
    </>
  );
}
