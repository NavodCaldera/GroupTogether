/** Dates use the Colombo calendar, independent of the server's timezone. */
export function nextSettlementSunday(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60_000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + ((7 - day.getUTCDay()) % 7));
  return day;
}

export const GIFT_STATUS = {
  RESERVED: "In basket",
  READY: "Awaiting dispatch",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  ISSUE: "Delivery issue",
  CANCELLED: "Cancelled",
} as const;

export const giftReference = (id: string) => `G-${id.slice(-8).toUpperCase()}`;
