import "server-only";
import { db } from "../db";

/** Agents buyers can choose at checkout: LIVE only, with their opening hours.
 * Feed these to nearestAgents. */
export async function liveAgents() {
  return db.agent.findMany({
    where: { status: "LIVE", user: { locked: false } },
    select: {
      id: true,
      lat: true,
      lng: true,
      address: true,
      city: true,
      user: { select: { name: true } },
      hours: {
        select: { weekday: true, opensAt: true, closesAt: true },
        orderBy: { weekday: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
}
