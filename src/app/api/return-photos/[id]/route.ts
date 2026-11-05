import { getCurrentUser } from "@/server/auth/session";
import { returnPhotoFor } from "@/server/returns";
import { storage } from "@/server/storage";
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const principal = await getCurrentUser();
  if (!principal) return denied();
  const photo = await returnPhotoFor(principal.id, (await ctx.params).id);
  if (!photo) return denied();
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
