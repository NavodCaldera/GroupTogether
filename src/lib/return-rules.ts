export const RETURN_STATUSES = [
  "WAITING_FACTORY",
  "WITH_ADMIN",
  "ACCEPTED",
  "REJECTED",
  "PICKED_UP",
  "RECEIVED",
  "COMPLETED",
  "AWAITING_HANDOVER",
  "HANDED_OVER",
  "LAPSED",
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
const WINDOW = 48 * 60 * 60 * 1000;
export function withinWindow(deliveredAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - deliveredAt.getTime();
  return elapsed >= 0 && elapsed <= WINDOW;
}
export function factoryOverdue(dueAt: Date, now: Date): boolean {
  return now > dueAt;
}
const MOVES: Record<ReturnStatus, readonly ReturnStatus[]> = {
  WAITING_FACTORY: ["ACCEPTED", "WITH_ADMIN"],
  WITH_ADMIN: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PICKED_UP", "RECEIVED", "WITH_ADMIN", "AWAITING_HANDOVER"],
  REJECTED: [],
  PICKED_UP: ["RECEIVED", "WITH_ADMIN"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  AWAITING_HANDOVER: ["HANDED_OVER", "LAPSED"],
  HANDED_OVER: ["PICKED_UP"],
  LAPSED: [],
};
export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return MOVES[from].includes(to);
}
