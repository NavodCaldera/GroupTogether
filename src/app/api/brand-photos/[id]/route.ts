import { getCurrentUser } from "@/server/auth/session";
import { brandPhotoFor } from "@/server/brand-photos";
import { storage } from "@/server/storage";

export async function GET(req: Request, ctx: RouteContext<"/api/brand-photos/[id]">) {
  const { id } = await ctx.params;
  const version = new URL(req.url).searchParams.get("revision");
  const photo = await brandPhotoFor(
    await getCurrentUser(),
    id,
    version === null ? undefined : Number(version),
  );
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!photo?.photoKey || !photo.photoType)
    return new Response("Not found", { status: 404, headers });
  const bytes = await storage().get(photo.photoKey);
  if (!bytes) return new Response("Not found", { status: 404, headers });
  return new Response(Buffer.from(bytes), {
    headers: { ...headers, "Content-Type": photo.photoType },
  });
}
