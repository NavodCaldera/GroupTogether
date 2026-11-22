"use server";

import { revalidatePath } from "next/cache";
import { BUYER_ROLES } from "@/lib/roles";
import { requireUser } from "./auth/session";
import { AppError } from "./errors";
import { flash } from "./flash";
import { joinGroup, setPickupPoint, startGroup } from "./packs";

export type PackState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function run(path: string, work: () => Promise<string>): Promise<PackState> {
  let done: string;
  try {
    done = await work();
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  revalidatePath(path);
  revalidatePath("/my-groups");
  await flash(done);
  return {};
}

export async function setPickupAction(_p: PackState, fd: FormData): Promise<PackState> {
  const path = str(fd, "path") || "/packs";
  const user = await requireUser([...BUYER_ROLES], path);
  return run(path, async () => {
    await setPickupPoint(user.id, str(fd, "agentId"));
    return "Pickup point saved";
  });
}

export async function joinGroupAction(_p: PackState, fd: FormData): Promise<PackState> {
  const path = str(fd, "path") || "/packs";
  const user = await requireUser([...BUYER_ROLES], path);
  return run(path, async () => {
    const r = await joinGroup(user.id, str(fd, "groupId"));
    return r.joined >= r.size ? "You took the last spot. The group is full" : `Joined: ${r.joined} of ${r.size} families`;
  });
}

export async function startGroupAction(_p: PackState, fd: FormData): Promise<PackState> {
  const path = str(fd, "path") || "/packs";
  const user = await requireUser([...BUYER_ROLES], path);
  return run(path, async () => {
    const r = await startGroup(user.id, str(fd, "versionId"));
    return `Group started: ${r.joined} of ${r.size} families`;
  });
}
