import type { BasketStatus, OrderStatus } from "@/generated/prisma/client";

const ORDER_MOVES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

const BASKET_MOVES: Record<BasketStatus, BasketStatus[]> = {
  // Own baskets (DEC-023) go OPEN -> AWAITING_FEE -> LOCKED and end DELIVERED, or CANCELLED unpaid.
  OPEN: ["LOCKED", "AWAITING_FEE", "CANCELLED"],
  AWAITING_FEE: ["LOCKED", "CANCELLED"],
  LOCKED: ["PACKED"],
  PACKED: ["WITH_COURIER"],
  WITH_COURIER: ["AT_AGENT", "DELIVERED"],
  AT_AGENT: [],
  DELIVERED: [],
  CANCELLED: [],
};

export function canMoveOrder(a: OrderStatus, b: OrderStatus): boolean {
  return ORDER_MOVES[a].includes(b);
}

export function canMoveBasket(a: BasketStatus, b: BasketStatus): boolean {
  return BASKET_MOVES[a].includes(b);
}
