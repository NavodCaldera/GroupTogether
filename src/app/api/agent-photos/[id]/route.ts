import { getCurrentUser } from "@/server/auth/session";
import { agentPhotoFor } from "@/server/agents/admin-screens";
import { IMAGE_TYPES, storage } from "@/server/storage";

const TYPE_OF = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([type, ext]) => [ext, type]));

/** An agent application photo (NIC, face, storage), for the Agents and orders admin only. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = () =>
    new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const principal = await getCurrentUser();
  if (!principal) return denied();
  const which = new URL(request.url).searchParams.get("k") ?? "";
  const key = await agentPhotoFor(principal.id, (await ctx.params).id, which);
  const type = key ? TYPE_OF[key.split(".").pop() ?? ""] : undefined;
  if (!key || !type) return denied();
  const bytes = await storage().get(key);
  if (!bytes) return denied();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
