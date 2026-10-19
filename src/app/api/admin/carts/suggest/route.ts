import { suggestCarts } from "@/server/admin-queries";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Admins only: carts matching what is typed in the admin carts search. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(await suggestCarts(q), { headers: { "Cache-Control": "no-store" } });
}
