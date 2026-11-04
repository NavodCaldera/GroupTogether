import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireSeller } from "@/server/auth/session";
import { db } from "@/server/db";
import { canSell } from "@/server/agreements";
export default async function SellerWorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireSeller();
  const login = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { isBrand: true, factoryId: true },
  });
  if (!login.isBrand && !login.factoryId && !(await canSell(user.id)))
    redirect("/seller/agreement");
  return children;
}
