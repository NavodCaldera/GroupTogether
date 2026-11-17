import { canFactory, factoryOf } from "@/lib/factory-roles";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/**
 * A lab report PDF (DEC-022): the factory that owns the product, and Factory or Core admins.
 * Anyone else gets the same 404 as a missing file.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/lab-reports/[id]">) {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const user = await getCurrentUser();
  if (!user) return denied();
  const m = await db.measurement.findUnique({
    where: { id: (await ctx.params).id },
    select: {
      reportKey: true,
      reportType: true,
      productMaterial: { select: { product: { select: { sellerId: true } } } },
    },
  });
  if (!m?.reportKey || !m.reportType) return denied();
  const me = await db.user.findFirst({
    where: { id: user.id, locked: false },
    select: { id: true, role: true, adminArea: true, isBrand: true, factoryId: true, factoryRole: true },
  });
  if (!me) return denied();
  const admin = me.role === "ADMIN" && (me.adminArea === "FACTORY" || me.adminArea === "CORE");
  let factory = false;
  if (me.role === "SELLER" && !me.isBrand) {
    const { factoryId, factoryRole } = factoryOf(me);
    factory =
      canFactory(factoryRole, "products") &&
      factoryId === m.productMaterial?.product.sellerId;
  }
  if (!admin && !factory) return denied();
  const bytes = await storage().get(m.reportKey);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": m.reportType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
