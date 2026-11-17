import { AdminForm } from "@/app/admin/admin-form";
import { Field, Input } from "@/components/ui";
import { MEASURE_KINDS } from "@/lib/materials/measure";
import { setLabScopeAction } from "@/server/material-actions";

/** The tests a result can be entered for: the only ones whose accreditation matters */
const TESTS = [...new Set(MEASURE_KINDS.map((k) => k.testStandard))];

/**
 * Records the scope a Factory admin read in the lab's current SLAB scope document (DEC-022):
 * only the tests the document lists, with the date read and the document link.
 */
export function LabScopeForm({
  lab,
}: {
  lab: {
    code: string;
    name: string;
    accreditationNo: string | null;
    scope: string[];
    scopeVerifiedOn: Date | null;
  };
}) {
  const today = new Date().toISOString().slice(0, 10);
  const id = (s: string) => `scope-${lab.code}-${s}`;
  return (
    <details className="rounded-lg border border-line p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium sm:min-h-10">
        Record checked scope: {lab.name}
      </summary>
      <AdminForm
        action={setLabScopeAction}
        submit="Save scope"
        className="mt-2 flex flex-col gap-3"
      >
        <input type="hidden" name="lab" value={lab.code} />
        <fieldset className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
          <legend className="mb-1 text-sm font-bold">Tests the scope lists</legend>
          {TESTS.map((s) => (
            <label key={s} htmlFor={id(s)} className="flex min-h-11 items-center gap-2 sm:min-h-8">
              <input
                id={id(s)}
                type="checkbox"
                name="scope"
                value={s}
                defaultChecked={lab.scope.includes(s)}
              />
              {s.replace(/_/g, " ")}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Read on" name={`checkedOn-${lab.code}`}>
            <Input
              id={`checkedOn-${lab.code}`}
              name="checkedOn"
              type="date"
              max={today}
              defaultValue={today}
              required
            />
          </Field>
          <Field label="Accreditation no." name={`acc-${lab.code}`}>
            <Input
              id={`acc-${lab.code}`}
              name="accreditationNo"
              defaultValue={lab.accreditationNo ?? ""}
            />
          </Field>
        </div>
        <Field label="Scope document link" name={`src-${lab.code}`}>
          <Input id={`src-${lab.code}`} name="sourceUrl" type="url" placeholder="https://" />
        </Field>
      </AdminForm>
    </details>
  );
}
