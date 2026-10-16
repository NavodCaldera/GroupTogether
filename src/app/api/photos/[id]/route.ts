import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** Product photos are public and cached hard (a new photo gets a new key, so a new ETag). */
export async function GET(req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const p = await db.product.findUnique({
    where: { id },
    select: { photoKey: true, photoType: true },
  });
  if (!p?.photoKey || !p.photoType) return new Response("Not found", { status: 404 });
  const etag = `"${p.photoKey}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  const bytes = await storage().get(p.photoKey);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": p.photoType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
