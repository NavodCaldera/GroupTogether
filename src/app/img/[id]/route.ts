import { db } from "@/server/db";

/** A company-uploaded image. Ids are never reused, so browsers may cache it for good. */
export async function GET(_req: Request, ctx: RouteContext<"/img/[id]">) {
  const img = await db.image.findUnique({
    where: { id: (await ctx.params).id },
    select: { type: true, data: true },
  });
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
