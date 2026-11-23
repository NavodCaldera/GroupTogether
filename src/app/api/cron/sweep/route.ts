import { timingSafeEqual } from "node:crypto";
import { sweepPackGroups } from "@/server/packs-sweep";

/** Expires unpaid spots and extends or closes due baskets. Call daily with
 * `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !secret ||
    secret === "CHANGE_ME" ||
    given.length !== secret.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(secret))
  )
    return new Response("Unauthorized", { status: 401 });
  return Response.json({ baskets: await sweepPackGroups(new Date()) });
}
