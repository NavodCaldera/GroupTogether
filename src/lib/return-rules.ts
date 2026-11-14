/** Mirrors the ReturnStatus enum in prisma/schema.prisma. */
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
  "BUYER_REQUESTED",
  "WITH_AGENT",
  "SOLD",
  "TAKEN_BACK",
] as const;
type ReturnStatus = (typeof RETURN_STATUSES)[number];
const WINDOW = 48 * 60 * 60 * 1000;
export function withinWindow(deliveredAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - deliveredAt.getTime();
  return elapsed >= 0 && elapsed <= WINDOW;
}
export function factoryOverdue(dueAt: Date, now: Date): boolean {
  return now > dueAt;
}
const MOVES: Record<ReturnStatus, readonly ReturnStatus[]> = {
  WAITING_FACTORY: ["ACCEPTED", "WITH_ADMIN", "AWAITING_HANDOVER"],
  WITH_ADMIN: ["ACCEPTED", "REJECTED", "AWAITING_HANDOVER", "BUYER_REQUESTED"],
  ACCEPTED: ["PICKED_UP", "RECEIVED", "WITH_ADMIN", "AWAITING_HANDOVER"],
  REJECTED: [],
  PICKED_UP: ["RECEIVED", "WITH_ADMIN"],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  AWAITING_HANDOVER: ["HANDED_OVER", "WITH_AGENT", "LAPSED"],
  HANDED_OVER: ["PICKED_UP"],
  LAPSED: [],
  // Buyer fault (DEC-017): the Agents and orders admin decides; the agent resells privately.
  BUYER_REQUESTED: ["AWAITING_HANDOVER", "REJECTED"],
  WITH_AGENT: ["SOLD", "TAKEN_BACK"],
  SOLD: [],
  TAKEN_BACK: [],
};
export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return MOVES[from].includes(to);
}

/** Buyer-fault reasons (DEC-017), in form order. */
export const BUYER_FAULT_REASONS = [
  "MATERIAL",
  "SIZE",
  "COLOUR",
  "QUALITY_FEEL",
  "CHANGED_MIND",
  "OTHER",
] as const;
export type BuyerFaultReason = (typeof BUYER_FAULT_REASONS)[number];
export const BUYER_FAULT_LABEL: Record<BuyerFaultReason, string> = {
  MATERIAL: "Material not as expected",
  SIZE: "Size",
  COLOUR: "Colour",
  QUALITY_FEEL: "Quality feel",
  CHANGED_MIND: "Changed mind",
  OTHER: "Other",
};

/** Buyer-fault states that keep the unit off the line for good: it never enters returnedQty. */
export const BUYER_FAULT_KEPT: readonly ReturnStatus[] = [
  "BUYER_REQUESTED",
  "AWAITING_HANDOVER",
  "WITH_AGENT",
  "SOLD",
  "TAKEN_BACK",
];

/** What people see for a return status. */
export function returnStatusLabel(status: ReturnStatus, fault: "FACTORY" | "BUYER"): string {
  if (status === "LAPSED") return fault === "BUYER" ? "Not brought" : "Lapsed";
  const labels: Partial<Record<ReturnStatus, string>> = {
    WAITING_FACTORY: "Waiting for approval",
    WITH_ADMIN: "Waiting for approval",
    BUYER_REQUESTED: "Waiting for approval",
    AWAITING_HANDOVER: "Bring to agent",
    HANDED_OVER: "With agent",
    WITH_AGENT: "With agent",
    PICKED_UP: "Going back",
    SOLD: "Sold",
    TAKEN_BACK: "Taken back",
    REJECTED: "Refused",
  };
  return labels[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}
