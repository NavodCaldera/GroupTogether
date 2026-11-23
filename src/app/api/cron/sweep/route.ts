import { timingSafeEqual } from "node:crypto";
import { sweepPackGroups } from "@/server/packs-sweep";
import { expireReservations } from "@/server/resale";

/** Expires unpaid spots, extends or closes due baskets and expires lapsed resale reservations. Call daily with
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
  const now = new Date();
  return Response.json({
    baskets: await sweepPackGroups(now),
    reservations: await expireReservations(now),
  });
}
