"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import type { FactoryRole } from "@/generated/prisma/client";
import { requireFactory } from "./auth/session";
import { TeamError, addStaff, setStaffLocked, setStaffRole } from "./factory-team";
import { flash } from "./flash";

type TeamState = { error?: string; ok?: boolean };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function addStaffAction(_p: TeamState, fd: FormData): Promise<TeamState> {
  const me = await requireFactory("team");
  try {
    await addStaff(me.factoryId, Object.fromEntries(fd.entries()));
  } catch (e) {
    if (e instanceof TeamError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the form" };
    throw e;
  }
  revalidatePath("/seller/team");
  await flash("Staff added");
  return { ok: true };
}

/** Change a job, or lock / unlock a login, from one row of the Team page. */
export async function updateStaffAction(fd: FormData) {
  const me = await requireFactory("team");
  const staffId = str(fd, "staffId");
  try {
    const lock = str(fd, "lock");
    if (lock) {
      await setStaffLocked(me.factoryId, staffId, lock === "1", me.id);
      await flash(lock === "1" ? "Locked" : "Unlocked");
    } else {
      await setStaffRole(me.factoryId, staffId, str(fd, "role") as FactoryRole);
      await flash("Job changed");
    }
  } catch (e) {
    if (!(e instanceof TeamError)) throw e;
    await flash(e.message);
  }
  revalidatePath("/seller/team");
}
