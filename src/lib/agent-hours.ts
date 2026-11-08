import type { Hours } from "./agent-rules";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "Mon–Fri 09:00–18:00 · Sat 09:00–13:00": consecutive days with the same times share a range. */
export function formatHours(hours: Hours): string {
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const parts: { from: number; to: number; time: string }[] = [];
  for (const h of sorted) {
    const time = `${clock(h.opensAt)}–${clock(h.closesAt)}`;
    const last = parts.at(-1);
    if (last && last.time === time && last.to === h.weekday - 1) last.to = h.weekday;
    else parts.push({ from: h.weekday, to: h.weekday, time });
  }
  return parts
    .map((p) => `${DAYS[p.from]}${p.to > p.from ? `–${DAYS[p.to]}` : ""} ${p.time}`)
    .join(" · ");
}

export const mapLink = (p: { lat: number; lng: number }) =>
  `https://maps.google.com/?q=${p.lat},${p.lng}`;
