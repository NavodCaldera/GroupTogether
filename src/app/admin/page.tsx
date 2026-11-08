import { redirect } from "next/navigation";
import { adminHome } from "@/lib/admin-access";
import { requireAnyAdmin } from "@/server/auth/session";

/** Each admin lands on their own area's first page. */
export default async function AdminIndex() {
  const admin = await requireAnyAdmin();
  redirect(adminHome(admin.adminArea));
}
