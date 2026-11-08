import "server-only";
import type { OperationalAdminArea } from "@/lib/admin-access";
import { IN_SHOP } from "./catalogue";
import { db } from "./db";
import { brandInbox } from "./brand-communications";

/** Free stock at or below this shows as low. */
export const LOW_STOCK = 2;

/** Counts for the admin nav badges; each area counts only its own work. */
export async function adminBadges(adminId: string, area: OperationalAdminArea) {
  const none = Promise.resolve(0);
  const [lowStock, brandRewards] = await Promise.all([
    area === "FACTORY"
      ? db.variant.count({ where: { available: { lte: LOW_STOCK }, product: IN_SHOP } })
      : none,
    area === "PREMIUM" ? brandRewardWork(adminId) : none,
  ]);
  const [courier, applications, missing, payouts] = await Promise.all([
    area === "AGENTS"
      ? db.basket.count({ where: { status: "PACKED", courier: { is: null } } })
      : none,
    area === "AGENTS" ? db.agent.count({ where: { status: "APPLIED" } }) : none,
    area === "FACTORY"
      ? db.orderLine.count({
          where: { status: "ACTIVE", missingReportedQty: { gt: 0 }, order: { status: "PAID" } },
        })
      : none,
    area === "CORE" ? db.factoryPayout.count({ where: { paidAt: null } }) : none,
  ]);
  return {
    lowStock,
    brandRewards,
    courier,
    applications,
    missing,
    payouts,
  };
}

async function brandRewardWork(adminId: string) {
  const [reviews, issues, queries, inbox] = await Promise.all([
    db.brandOfferRevision.count({ where: { status: "IN_REVIEW", supersededAt: null } }),
    db.giftOrder.count({ where: { status: "ISSUE" } }),
    db.giftSettlement.count({ where: { queryOpen: true } }),
    brandInbox(adminId),
  ]);
  return reviews + issues + queries + inbox.filter((thread) => thread.unread > 0).length;
}
