import { distanceKm, sortNearest, type Point } from "@/lib/distance";

/** True when any other pin is strictly closer than gapM metres. */
export function clashesWith(pin: Point, others: Point[], gapM: number): boolean {
  return others.some((o) => distanceKm(pin, o) * 1000 < gapM);
}

/** Agents nearest first with distance in km; with no buyer pin keeps the given order and null. */
export function nearestAgents<T extends Point>(
  buyer: Point | null,
  agents: T[],
): (T & { distanceKm: number | null })[] {
  const withKm = agents.map((a) => ({ ...a, distanceKm: buyer ? distanceKm(buyer, a) : null }));
  return buyer ? sortNearest(withKm) : withKm;
}

/** Weekday 0 = Sunday .. 6 = Saturday; opensAt/closesAt are minutes since Colombo midnight. */
export type Hours = { weekday: number; opensAt: number; closesAt: number }[];

const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // fixed UTC+05:30, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

export function openNow(hours: Hours, now: Date): boolean {
  const local = new Date(now.getTime() + COLOMBO_OFFSET_MS);
  const weekday = local.getUTCDay();
  const m = local.getUTCHours() * 60 + local.getUTCMinutes();
  return hours.some((h) => h.weekday === weekday && h.opensAt <= m && m < h.closesAt);
}

/** The most recent Saturday 23:59:59.999 Colombo time that is <= now. */
export function weekEnding(now: Date): Date {
  const local = now.getTime() + COLOMBO_OFFSET_MS;
  const dayStart = Math.floor(local / DAY_MS) * DAY_MS;
  const weekday = new Date(dayStart).getUTCDay();
  let end = dayStart + (6 - weekday) * DAY_MS + DAY_MS - 1; // this week's Saturday end
  if (end > local) end -= 7 * DAY_MS;
  return new Date(end - COLOMBO_OFFSET_MS);
}

export function isPickupCode(s: string): boolean {
  return /^\d{6}$/.test(s);
}
