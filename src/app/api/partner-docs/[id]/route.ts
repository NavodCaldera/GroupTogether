import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!user || user.role !== "ADMIN") return denied();
  const admin = await db.user.findFirst({
    where: { id: user.id, role: "ADMIN", locked: false, adminArea: { in: ["FACTORY", "CORE"] } },
    select: { id: true },
  });
  if (!admin) return denied();
  const doc = await db.factoryDocument.findUnique({
    where: { id: (await ctx.params).id },
    select: { storageKey: true, contentType: true },
  });
  if (!doc) return denied();
  const bytes = await storage().get(doc.storageKey);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": doc.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
