import { canAdminArea } from "@/lib/admin-access";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** A bank slip: only its uploader (the cart owner) and admins can open it. */
export async function GET(_req: Request, ctx: RouteContext<"/api/slips/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const slip = await db.paymentSlip.findUnique({ where: { id } });
  if (!slip || (!canAdminArea(user, "AGENTS") && slip.uploaderId !== user.id))
    return new Response("Not found", { status: 404 });
  const bytes = await storage().get(slip.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": slip.contentType,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
