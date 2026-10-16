import { salesSnapshot } from "@/server/catalogue";

export const dynamic = "force-dynamic";

/** Public and tiny: the sales count for the home page. */
export async function GET() {
  return Response.json(await salesSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
