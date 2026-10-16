import { timingSafeEqual } from "node:crypto";
import { sweep } from "@/server/carts/service";

/**
 * Expires carts past 24h and cancels missed 2h slip windows. Call every few minutes with
 * `Authorization: Bearer $CRON_SECRET`. Pages also sweep on load, so a late cron only delays emails.
 */
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
  return Response.json(await sweep());
}
