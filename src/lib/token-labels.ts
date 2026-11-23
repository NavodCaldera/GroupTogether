import { colomboIsoDay } from "./format";

const time = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Colombo",
});
const dayMonth = (withYear: boolean) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "Asia/Colombo",
  });

/** "14:05" in Colombo time. */
export const formatTime = (date: Date) => time.format(date);

/** Entries grouped by Colombo day, newest first as given, each under "Today", "Yesterday",
 * "19 Oct" or, for another year, "19 Oct 2025". */
export function groupByDay<T extends { createdAt: Date }>(entries: T[], now = new Date()) {
  const today = colomboIsoDay(now);
  const yesterday = colomboIsoDay(new Date(now.getTime() - 86_400_000));
  const groups: { day: string; label: string; entries: T[] }[] = [];
  for (const e of entries) {
    const day = colomboIsoDay(e.createdAt);
    let group = groups.at(-1);
    if (group?.day !== day) {
      const label =
        day === today
          ? "Today"
          : day === yesterday
            ? "Yesterday"
            : dayMonth(day.slice(0, 4) !== today.slice(0, 4)).format(e.createdAt);
      group = { day, label, entries: [] };
      groups.push(group);
    }
    group.entries.push(e);
  }
  return groups;
}
