import { timingSafeEqual } from "node:crypto";
import { runSweep } from "@/server/sweep";

/**
 * Runs every time-based rule (order expiry, basket max wait, returns, leaving agents, weekly
 * payouts and agent fees). Call every few minutes with `Authorization: Bearer $CRON_SECRET`.
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
  return Response.json(await runSweep());
}
