import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const principal = await getCurrentUser();
  if (!principal) return denied();
  const user = await db.user.findFirst({
    where: { id: principal.id, locked: false },
    select: { id: true, role: true, adminArea: true },
  });
  if (!user) return denied();
  const photo = await db.reportPhoto.findUnique({
    where: { id: (await ctx.params).id },
    select: {
      storageKey: true,
      contentType: true,
      report: { select: { rating: { select: { userId: true } } } },
    },
  });
  if (
    !photo ||
    (photo.report.rating.userId !== user.id &&
      !(user.role === "ADMIN" && ["FACTORY", "CORE"].includes(user.adminArea ?? "")))
  )
    return denied();
  const bytes = await storage().get(photo.storageKey);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
