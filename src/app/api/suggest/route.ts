import type { Suggestion } from "@/components/suggest-input";
import { formatLKR } from "@/lib/format";
import { suggestProducts } from "@/server/catalogue";

export const dynamic = "force-dynamic";

/** Public and small: product names for the shop search dropdown. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cart = sp.get("cart");
  const rows = await suggestProducts(sp.get("q") ?? "");
  return Response.json(
    rows.map((r): Suggestion => ({
      href: `/products/${r.id}${cart ? `?cart=${encodeURIComponent(cart)}` : ""}`,
      main: r.title,
      sub: r.brand,
      side: formatLKR(r.price),
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
