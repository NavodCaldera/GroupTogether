import { suggestProducts } from "@/server/catalogue";

export const dynamic = "force-dynamic";

/** Public and small: product names for the shop search dropdown. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await suggestProducts(q);
  return Response.json(
    rows.map((r) => ({ id: r.id, title: r.title, brand: r.brand, price: r.price.toString() })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
