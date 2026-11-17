import { db } from "@/server/db";
import { getProduct } from "@/server/catalogue";
import { storage } from "@/server/storage";

/** A fabric video on the Material Card (DEC-022): public while its product is in the shop. */
export async function GET(req: Request, ctx: RouteContext<"/api/material-videos/[id]">) {
  const pm = await db.productMaterial.findUnique({
    where: { id: (await ctx.params).id },
    select: { productId: true, videoKey: true, videoType: true },
  });
  if (!pm?.videoKey || !pm.videoType || !(await getProduct(pm.productId)))
    return new Response("Not found", { status: 404 });
  const etag = `"${pm.videoKey}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  const bytes = await storage().get(pm.videoKey);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": pm.videoType,
      "Cache-Control": "public, max-age=3600",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
