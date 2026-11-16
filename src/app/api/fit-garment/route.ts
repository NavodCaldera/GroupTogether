import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { deepFitGarmentFor } from "@/server/deep-fit";

/**
 * A garment simulated on the signed-in buyer's own body (Deep Fit Test, DEC-021):
 * `?job=<id>&size=<s>`. Private: never another buyer's, never cached.
 */
export async function GET(request: Request) {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const params = new URL(request.url).searchParams;
  const job = params.get("job");
  const size = params.get("size");
  if (!job || !size) return denied();
  const principal = await getCurrentUser();
  if (!principal) return denied();
  const user = await db.user.findFirst({
    where: { id: principal.id, locked: false },
    select: { id: true },
  });
  if (!user) return denied();
  const bytes = await deepFitGarmentFor(user.id, job, size);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
