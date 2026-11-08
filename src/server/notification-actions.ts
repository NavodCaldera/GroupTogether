"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth/session";
import { db } from "./db";
import { flash } from "./flash";

export async function markAllReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  await flash("All marked as read");
}
