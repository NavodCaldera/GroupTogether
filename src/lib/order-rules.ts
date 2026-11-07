import type { BasketStatus, OrderStatus } from "@/generated/prisma/client";

export const ORDER_MOVES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export const BASKET_MOVES: Record<BasketStatus, BasketStatus[]> = {
  OPEN: ["LOCKED"],
  LOCKED: ["PACKED"],
  PACKED: ["WITH_COURIER"],
  WITH_COURIER: ["AT_AGENT"],
  AT_AGENT: [],
};

export function canMoveOrder(a: OrderStatus, b: OrderStatus): boolean {
  return ORDER_MOVES[a].includes(b);
}

export function canMoveBasket(a: BasketStatus, b: BasketStatus): boolean {
  return BASKET_MOVES[a].includes(b);
}
