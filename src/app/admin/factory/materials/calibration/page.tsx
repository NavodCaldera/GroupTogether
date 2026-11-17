import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm } from "@/app/admin/admin-form";
import { Table } from "@/app/admin/list-bits";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/server/auth/session";
import { createCalibrationSetAction } from "@/server/material-actions";
import { listCalibrationSets } from "@/server/material-admin";
import { MaterialsNav } from "../materials-nav";

export const metadata: Metadata = { title: "Reference swatches" };

/**
 * Reference swatch sets (DEC-022): fabrics measured at an accredited lab that measured bars are
 * ranked against. A bar turns measured only with an active set of 10 or more accredited results.
 */
export default async function CalibrationPage() {
  await requireAdmin("FACTORY");
  const sets = await listCalibrationSets();
  return (
    <>
      <PageHeader title="Reference swatches" />
      <MaterialsNav active="Reference swatches" />
      {sets.length > 0 && (
        <Table
          head={
            <>
              <th>Set</th>
              <th>Swatches</th>
              <th>Results</th>
              <th>Status</th>
            </>
          }
        >
          {sets.map((s) => (
            <tr key={s.id}>
              <td>
                <Link href={`/admin/factory/materials/calibration/${s.code}`} className="underline">
                  {s.name}
                </Link>
              </td>
              <td className="tabular-nums">{s.swatches.length}</td>
              <td className="tabular-nums">
                {s.swatches.reduce((n, w) => n + w._count.measurements, 0)}
              </td>
              <td>
                <Badge tone={s.activeAt ? "good" : "neutral"}>
                  {s.activeAt ? "Active" : "Off"}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Card className="mt-6 max-w-md">
        <h2 className="mb-2 font-semibold">New set</h2>
        <AdminForm action={createCalibrationSetAction} submit="Create set">
          <Field label="Code" name="code">
            <Input name="code" placeholder="GB-REF-1" required />
          </Field>
          <Field label="Name" name="name">
            <Input name="name" placeholder="GroupBasket Reference Swatch Set" required />
          </Field>
        </AdminForm>
      </Card>
    </>
  );
}
