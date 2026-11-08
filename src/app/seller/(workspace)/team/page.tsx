import type { Metadata } from "next";
import { AdminForm } from "@/app/admin/admin-form";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { FACTORY_ROLES, FACTORY_ROLE_LABEL } from "@/lib/factory-roles";
import { requireFactory } from "@/server/auth/session";
import { db } from "@/server/db";
import { factoryTeam } from "@/server/factory-team";
import { addStaffAction, updateStaffAction } from "@/server/factory-team-actions";
import { FactoryShell, Ticket } from "@/app/seller/factory-bits";

export const metadata: Metadata = { title: "Team" };

/**
 * The owner's team (product owner, 2026-11-04): one row per person with their job; change the job or lock someone who leaves in the row. Add staff below.
 * The factory account itself is always an owner.
 */
export default async function FactoryTeamPage() {
  const me = await requireFactory("team");
  const [factory, staff] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: me.factoryId },
      select: { id: true, name: true, email: true },
    }),
    factoryTeam(me.factoryId),
  ]);
  const people = [
    { ...factory, factoryRole: "OWNER" as const, locked: false, main: true },
    ...staff.map((s) => ({
      ...s,
      factoryRole: s.factoryRole ?? ("PACKING" as const),
      main: false,
    })),
  ];

  return (
    <FactoryShell active="team" role={me.factoryRole} title="Team">
      <ul className="mb-6 flex flex-col divide-y-2 divide-dashed divide-line border-y-2 border-ink">
        {people.map((p) => (
          <li key={p.id} aria-label={p.name} className="py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 text-lg font-bold break-words">
                {p.name}
                {p.id === me.id && (
                  <span className="ml-2 text-sm font-normal text-subtle">You</span>
                )}
              </span>
              {p.locked ? (
                <Badge tone="bad">Locked</Badge>
              ) : (
                <Badge>{FACTORY_ROLE_LABEL[p.factoryRole]}</Badge>
              )}
            </div>
            <p className="text-sm break-all text-subtle">{p.email}</p>
            {!p.main && (
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                <form action={updateStaffAction} className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input type="hidden" name="staffId" value={p.id} />
                  <Select
                    name="role"
                    defaultValue={p.factoryRole}
                    id={`role-${p.id}`}
                    aria-label={`Job of ${p.name}`}
                    className="min-h-12"
                  >
                    {FACTORY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {FACTORY_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" className="min-h-12">
                    Change
                  </Button>
                </form>
                {p.id !== me.id && (
                  <form action={updateStaffAction}>
                    <input type="hidden" name="staffId" value={p.id} />
                    <input type="hidden" name="lock" value={p.locked ? "0" : "1"} />
                    <Button variant={p.locked ? "secondary" : "danger"} className="min-h-12">
                      {p.locked ? "Unlock" : "Lock"}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <Ticket head={<h2 className="text-xl font-bold">Add staff</h2>}>
        <AdminForm action={addStaffAction} submit="Add staff">
          <Field label="Name" name="name">
            <Input id="name" name="name" required />
          </Field>
          <Field label="Email (they sign in with this)" name="email">
            <Input id="email" name="email" type="email" autoComplete="off" required />
          </Field>
          <Field label="Mobile" name="phone">
            <Input id="phone" name="phone" inputMode="tel" placeholder="0771234567" />
          </Field>
          <Field label="Job" name="role">
            <Select id="role" name="role" defaultValue="PACKING">
              {FACTORY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {FACTORY_ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Temporary password" name="password">
            <Input
              id="password"
              name="password"
              type="text"
              minLength={8}
              autoComplete="off"
              required
            />
          </Field>
        </AdminForm>
      </Ticket>
    </FactoryShell>
  );
}
