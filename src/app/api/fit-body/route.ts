import { getCurrentUser } from "@/server/auth/session";
import { bodyFileFor } from "@/server/body-fit";
import { db } from "@/server/db";

/** The signed-in buyer's own 3D body (DEC-021). Private: never another buyer's, never cached. */
export async function GET() {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const principal = await getCurrentUser();
  if (!principal) return denied();
  const user = await db.user.findFirst({
    where: { id: principal.id, locked: false },
    select: { id: true },
  });
  if (!user) return denied();
  const bytes = await bodyFileFor(user.id);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
