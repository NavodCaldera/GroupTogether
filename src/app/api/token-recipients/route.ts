import type { Suggestion } from "@/components/suggest-input";
import { isBuyerRole } from "@/lib/roles";
import { getCurrentUser } from "@/server/auth/session";
import { suggestTokenRecipients } from "@/server/tokens";

export const dynamic = "force-dynamic";

/** Signed-in buyers and agents only: accounts to send tokens to, for the Send tokens field. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isBuyerRole(user.role)) return new Response(null, { status: 401 });
  const rows = await suggestTokenRecipients(user.id, new URL(req.url).searchParams.get("q") ?? "");
  return Response.json(
    rows.map((r): Suggestion => ({
      href: r.id,
      value: r.email,
      main: r.name,
      sub: [r.email, r.phone].filter(Boolean).join(" · "),
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
