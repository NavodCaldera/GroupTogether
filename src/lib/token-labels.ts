import type { TokenKind } from "@/generated/prisma/enums";
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

/** How a buyer's token entry reads in their history. */
export type TokenTone = "in" | "out" | "refund" | "order";

const KINDS: Record<TokenKind, { title: string; tone: TokenTone; note: boolean }> = {
  RETURN: { title: "Return refund", tone: "refund", note: true },
  HOLD: { title: "Paid towards an order", tone: "order", note: false },
  RELEASE: { title: "Back from an unpaid order", tone: "refund", note: false },
  SPEND: { title: "Spent on an order", tone: "order", note: false },
  LATE_PAYMENT: { title: "Late payment returned", tone: "refund", note: true },
  ORDER_CANCEL: { title: "Order refund", tone: "refund", note: true },
  AGENT_FEE: { title: "Agent fee", tone: "in", note: true },
  COURIER_REPAY: { title: "Courier repaid", tone: "in", note: true },
  FEE_CLAWBACK: { title: "Fee taken back", tone: "out", note: true },
  MISSING_ITEM: { title: "Missing item refund", tone: "refund", note: true },
  DEPOSIT_RETURN: { title: "Deposit returned", tone: "in", note: true },
  TRANSFER_OUT: { title: "Sent", tone: "out", note: false },
  TRANSFER_IN: { title: "Received", tone: "in", note: false },
};

/** Title and detail line for one entry. A transfer names the other person instead of the note,
 * and a note that only repeats the title is left out. */
export function tokenEntryLabel(e: {
  kind: TokenKind;
  note: string;
  counterparty?: string | null;
}) {
  const k = KINDS[e.kind];
  const title =
    e.counterparty && e.kind === "TRANSFER_OUT"
      ? `To ${e.counterparty}`
      : e.counterparty && e.kind === "TRANSFER_IN"
        ? `From ${e.counterparty}`
        : k.title;
  return { title, detail: k.note ? e.note : null, tone: k.tone };
}
