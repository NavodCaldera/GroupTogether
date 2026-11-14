import {
  messageText,
  checkMessageRate,
  deliverUnreadThreadNotice,
  readThreadNotice,
} from "./private-thread";
import "server-only";
import type { Prisma, ReturnRequest, ReturnStatus } from "@/generated/prisma/client";
import {
  BUYER_FAULT_KEPT,
  BUYER_FAULT_REASONS,
  canMoveReturn,
  factoryOverdue,
  type BuyerFaultReason,
} from "@/lib/return-rules";
import { REPORT_REASONS, type ReportReason } from "@/lib/quality-rules";
import { factoryOf } from "@/lib/factory-roles";
import { toD } from "@/lib/decimal";
import { factoryFaultRefund } from "@/lib/agent-money";
import { db, type Tx } from "./db";
import { CartError } from "@/server/errors";
import { lockLedgerUsers, withOrderTransaction } from "./orders/locks";
import { agentFeeKey, takeBackFee } from "./agent-fees";
import { checkUpload, IMAGE_TYPES, saveUpload } from "./storage";
import { credit } from "./tokens";
import { assertQualityAdmin } from "./quality";
import { recordFault, enforceHold } from "./fault-holds";
import { flushQualityNotices } from "./quality-notices";
import { notify } from "./notify";
import { AGENTS_AREA } from "@/lib/admin-access";
import { isBuyerRole } from "@/lib/roles";
import { AGENT_ACCESS } from "./auth/service";

class ReturnError extends CartError {}
const decided = () => new ReturnError("This return has already been decided");
/** Open returns whose quantity is not yet in OrderLine.returnedQty. */
const UNCOLLECTED_RETURN_STATUSES: ReturnStatus[] = [
  "WAITING_FACTORY",
  "WITH_ADMIN",
  "ACCEPTED",
  "AWAITING_HANDOVER",
];

async function activeUser(tx: Tx, id: string) {
  const user = await tx.user.findFirst({
    where: { id, locked: false },
    select: {
      id: true,
      role: true,
      adminArea: true,
      factoryId: true,
      factoryRole: true,
      isBrand: true,
    },
  });
  if (!user) throw new ReturnError("Return access denied");
  return user;
}
async function factoryActor(tx: Tx, id: string, factoryId: string) {
  const user = await activeUser(tx, id);
  const factory = factoryOf(user);
  const profile = await tx.factoryProfile.findUnique({
    where: { factoryUserId: factoryId },
    select: { status: true },
  });
  if (
    user.role !== "SELLER" ||
    user.isBrand ||
    factory.factoryId !== factoryId ||
    !["OWNER", "SALES"].includes(factory.factoryRole) ||
    profile?.status !== "ACTIVE"
  )
    throw new ReturnError("Factory owner or Sales access required");
  return user;
}
async function qualityActor(tx: Tx, id: string) {
  const user = await activeUser(tx, id);
  if (user.role !== "ADMIN" || !["FACTORY", "CORE"].includes(user.adminArea ?? ""))
    throw new ReturnError("Quality admin access required");
}
/** Buyer-fault returns belong to the Agents and orders admin (DEC-017). */
async function agentsActor(tx: Tx, id: string) {
  const user = await activeUser(tx, id);
  if (user.role !== "ADMIN" || user.adminArea !== AGENTS_AREA)
    throw new ReturnError("Agents and orders admin access required");
}
async function queue(
  tx: Tx,
  request: ReturnRequest,
  event: string,
  title: string,
  side: "buyer" | "factory" | "admin" | "agents",
) {
  const users =
    side === "buyer"
      ? [{ id: request.buyerId }]
      : side === "factory"
        ? await tx.user.findMany({
            where: {
              role: "SELLER",
              locked: false,
              OR: [
                { id: request.factoryId },
                { factoryId: request.factoryId, factoryRole: { in: ["OWNER", "SALES"] } },
              ],
              AND: [
                {
                  OR: [
                    { factoryProfile: { is: { status: "ACTIVE" } } },
                    { factory: { factoryProfile: { is: { status: "ACTIVE" } } } },
                  ],
                },
              ],
            },
            select: { id: true },
          })
        : await tx.user.findMany({
            where: {
              role: "ADMIN",
              locked: false,
              adminArea: { in: side === "agents" ? [AGENTS_AREA] : ["FACTORY", "CORE"] },
            },
            select: { id: true },
          });
  const href =
    side === "buyer"
      ? await buyerHref(tx, request)
      : side === "factory"
        ? "/seller/returns"
        : side === "agents"
          ? "/admin/agents/returns"
          : `/admin/factory/returns/${request.id}`;
  for (const user of users)
    await tx.returnNotice.upsert({
      where: { id: `${request.id}:${event}:${user.id}` },
      create: {
        id: `${request.id}:${event}:${user.id}`,
        returnId: request.id,
        userId: user.id,
        title,
        href,
      },
      update: {},
    });
}
async function buyerHref(tx: Tx, request: ReturnRequest) {
  if (!request.orderLineId) return "/notifications";
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: request.orderLineId },
    select: { orderId: true },
  });
  return `/orders/${line.orderId}`;
}
export async function flushReturnNotices() {
  const items = await db.returnNotice.findMany({
    where: { deliveredAt: null },
    select: { id: true, userId: true, title: true, href: true },
  });
  for (const item of items) {
    // A removal can invalidate queued factory notices before delivery.
    const user = await db.user.findFirst({
      where: { id: item.userId, locked: false },
      select: { role: true, factoryId: true, id: true },
    });
    const removed =
      user?.role === "SELLER" &&
      (await db.factoryProfile.count({
        where: { factoryUserId: user.factoryId ?? user.id, status: "REMOVED" },
      }));
    if (item.title === "New return message") {
      // Serialize unread-notice delivery with thread reads and other deliveries.
      await db.$transaction(async (tx) => {
        const entry = await tx.returnNotice.findUniqueOrThrow({
          where: { id: item.id },
          select: { returnId: true },
        });
        await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${entry.returnId} FOR UPDATE`;
        const pending = await tx.returnNotice.findUniqueOrThrow({
          where: { id: item.id },
          select: { deliveredAt: true },
        });
        if (pending.deliveredAt) return;
        if (user && !removed)
          await deliverUnreadThreadNotice(tx, { ...item, id: `return:${item.id}:${item.userId}` });
        await tx.returnNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
      });
      continue;
    }
    if (user && !removed)
      await notify(
        [item.userId],
        { title: item.title, body: "", href: item.href },
        `return:${item.id}`,
      );
    await db.returnNotice.update({ where: { id: item.id }, data: { deliveredAt: new Date() } });
  }
}
async function move(
  tx: Tx,
  r: ReturnRequest,
  status: ReturnStatus,
  data: Prisma.ReturnRequestUpdateInput = {},
) {
  if (!canMoveReturn(r.status, status)) throw decided();
  return tx.returnRequest.update({ where: { id: r.id }, data: { ...data, status } });
}
/** Sorted buyer/factory/actor advisories -> Order row -> return row -> Variant -> ledger user. */
async function locked<T>(
  actorId: string | null,
  id: string,
  work: (tx: Tx, r: ReturnRequest) => Promise<T>,
) {
  const first = await db.returnRequest.findUnique({
    where: { id },
    select: { factoryId: true, buyerId: true, orderLine: { select: { orderId: true } } },
  });
  if (!first?.orderLine) throw new ReturnError("Return not found");
  const result = await withOrderTransaction(
    [first.buyerId, first.factoryId, ...(actorId ? [actorId] : [])],
    [first.orderLine.orderId],
    async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${id} FOR UPDATE`;
      const r = await tx.returnRequest.findUniqueOrThrow({ where: { id } });
      return work(tx, r);
    },
  );
  const holds = await db.faultHold.findMany({
    where: { factoryId: first.factoryId, decidedAt: null, cleanedAt: null },
    select: { id: true },
  });
  for (const hold of holds) await enforceHold(hold.id);
  await flushReturnNotices();
  await flushQualityNotices();
  return result;
}
export async function fileReturn(
  buyerId: string,
  orderLineId: string,
  input: {
    fault: "FACTORY" | "BUYER";
    /** Factory fault only */
    reason?: ReportReason | null;
    /** Buyer fault only (DEC-017) */
    buyerReason?: BuyerFaultReason | null;
    note: string;
    photos: File[];
    qty?: number;
  },
  now = new Date(),
) {
  const qty = input.qty ?? 1;
  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    !["FACTORY", "BUYER"].includes(input.fault) ||
    (input.fault === "FACTORY" && !REPORT_REASONS.includes(input.reason as ReportReason)) ||
    (input.fault === "BUYER" &&
      !BUYER_FAULT_REASONS.includes(input.buyerReason as BuyerFaultReason)) ||
    !input.note.trim() ||
    input.note.length > 2000 ||
    input.photos.length > 5
  )
    throw new ReturnError("Check the return details and quantity");
  if (input.fault === "FACTORY" && !input.photos.length)
    throw new ReturnError("Add at least one photo");
  for (const file of input.photos) checkUpload(file, IMAGE_TYPES, "return photo");
  const first = await db.orderLine.findUnique({
    where: { id: orderLineId },
    select: { order: { select: { id: true, buyerId: true, factoryId: true } } },
  });
  if (!first || first.order.buyerId !== buyerId)
    throw new ReturnError("Return only your own collected item");
  const { factoryId } = first.order;
  const r = await withOrderTransaction([buyerId, factoryId], [first.order.id], async (tx) => {
    const user = await activeUser(tx, buyerId);
    const line = await tx.orderLine.findUniqueOrThrow({
      where: { id: orderLineId },
      include: { order: { select: { buyerId: true, status: true, receivedAt: true } } },
    });
    const { collectHours } = await tx.settings.findUniqueOrThrow({
      where: { id: 1 },
      select: { collectHours: true },
    });
    if (!isBuyerRole(user.role) || line.order.buyerId !== buyerId)
      throw new ReturnError("Return only your own collected item");
    if (line.order.status !== "RECEIVED" || !line.order.receivedAt || !line.collectedAt)
      throw new ReturnError("Return only an item you have collected");
    const elapsed = now.getTime() - line.order.receivedAt.getTime();
    if (elapsed < 0 || elapsed > collectHours * 3600000)
      throw new ReturnError(`Return within ${collectHours} hours of the agent receiving it`);
    // Collected factory-fault returns are already in returnedQty; buyer-fault ones never are.
    const open = await tx.returnRequest.aggregate({
      where: {
        orderLineId,
        OR: [
          { status: { in: UNCOLLECTED_RETURN_STATUSES } },
          { fault: "BUYER", status: { in: [...BUYER_FAULT_KEPT] } },
        ],
      },
      _sum: { qty: true },
    });
    if (qty > line.qty - line.returnedQty - line.missingQty - (open._sum.qty ?? 0))
      throw new ReturnError("Quantity unavailable for this item");
    const photos = [];
    for (const file of input.photos)
      photos.push(await saveUpload(file, "return-photos", IMAGE_TYPES));
    const buyer = input.fault === "BUYER";
    const removed =
      !buyer &&
      !!(await tx.factoryProfile.count({
        where: { factoryUserId: factoryId, status: "REMOVED" },
      }));
    const r = await tx.returnRequest.create({
      data: {
        orderLineId,
        buyerId,
        factoryId,
        qty,
        reason: buyer ? null : input.reason,
        buyerReason: buyer ? input.buyerReason : null,
        fault: input.fault,
        note: input.note.trim(),
        createdAt: now,
        // The factory never decides a buyer-fault return; its due time is unused.
        factoryDueAt: buyer ? now : new Date(now.getTime() + 24 * 3600000),
        status: buyer ? "BUYER_REQUESTED" : removed ? "WITH_ADMIN" : "WAITING_FACTORY",
        escalatedAt: removed ? now : null,
        photos: { create: photos },
      },
    });
    if (buyer) await queue(tx, r, "filed", "Buyer return requested", "agents");
    else {
      await queue(tx, r, "filed", "Return requested", removed ? "admin" : "factory");
      await queue(tx, r, "filed", "Return requested", "admin");
    }
    return r;
  });
  await flushReturnNotices();
  return r;
}
/** Acceptance hands the return to the order's agent for the buyer to drop off. */
async function toHandover(
  tx: Tx,
  r: ReturnRequest,
  now: Date,
  data: Prisma.ReturnRequestUpdateInput,
) {
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: r.orderLineId! },
    select: { order: { select: { agentId: true } } },
  });
  // FOR SHARE serializes with closeLeavingAgents (Agent FOR NO KEY UPDATE): an agent is never
  // closed with a return just assigned to it. A LEAVING agent still takes returns until it closes.
  await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${line.order.agentId} FOR SHARE`;
  const agent = await tx.agent.findUniqueOrThrow({
    where: { id: line.order.agentId },
    select: { status: true },
  });
  if (agent.status === "LEFT") throw new ReturnError("The agent for this order has closed");
  const { returnHandoverDays, buyerHandoverDays } = await tx.settings.findUniqueOrThrow({
    where: { id: 1 },
    select: { returnHandoverDays: true, buyerHandoverDays: true },
  });
  const days = r.fault === "BUYER" ? buyerHandoverDays : returnHandoverDays;
  return move(tx, r, "AWAITING_HANDOVER", {
    ...data,
    handoverAgent: { connect: { id: line.order.agentId } },
    handoverDueAt: new Date(now.getTime() + days * 86400000),
  });
}
/** After commit: the buyer learns which agent takes the item; the agent sees it coming. */
async function announceHandover(r: ReturnRequest) {
  if (r.status !== "AWAITING_HANDOVER" || !r.handoverAgentId) return;
  const agent = await db.agent.findUniqueOrThrow({
    where: { id: r.handoverAgentId },
    select: { userId: true, address: true, city: true, user: { select: { name: true } } },
  });
  const line = await db.orderLine.findUniqueOrThrow({
    where: { id: r.orderLineId! },
    select: { orderId: true },
  });
  const place = [agent.address, agent.city].filter(Boolean).join(", ");
  await notify(
    [r.buyerId],
    {
      title: "Return accepted",
      body: `${agent.user.name} · ${place}`,
      href: `/orders/${line.orderId}`,
    },
    `return:${r.id}:handover`,
  );
  await notify(
    [agent.userId],
    {
      title: "Return to collect",
      body: `${r.qty} item${r.qty === 1 ? "" : "s"}`,
      href: "/agent/returns",
    },
    `return:${r.id}:collect`,
  );
}
export async function factoryDecide(
  staffUserId: string,
  returnId: string,
  accept: boolean,
  now = new Date(),
  note = "",
) {
  if (!accept && (!note.trim() || note.trim().length > 1000))
    throw new ReturnError("Give a refusal reason from 1 to 1000 characters");
  const after = await locked(staffUserId, returnId, async (tx, r) => {
    await factoryActor(tx, staffUserId, r.factoryId);
    if (r.status !== "WAITING_FACTORY" || factoryOverdue(r.factoryDueAt, now)) throw decided();
    const decision = { factoryDecidedAt: now, factoryDecidedById: staffUserId };
    if (accept) return toHandover(tx, r, now, decision);
    const after = await move(tx, r, "WITH_ADMIN", {
      ...decision,
      factoryNote: note.trim(),
      escalatedAt: now,
    });
    await queue(tx, after, "factory-decision", "Return sent to admin", "buyer");
    await queue(tx, after, "factory-refused", "Return needs review", "admin");
    return after;
  });
  await announceHandover(after);
  return after;
}
export async function adminDecide(
  adminId: string,
  returnId: string,
  accept: boolean,
  note: string,
) {
  if (!note.trim() || note.length > 2000) throw new ReturnError("Add a decision note");
  const after = await locked(adminId, returnId, async (tx, r) => {
    await qualityActor(tx, adminId);
    if (r.status !== "WITH_ADMIN" || r.adminDecision !== null || r.fault !== "FACTORY")
      throw decided();
    const decision = { adminId, adminDecision: accept, adminNote: note.trim() };
    await queue(tx, r, "admin-decision", "Admin decided return", "factory");
    if (accept) return toHandover(tx, r, new Date(), decision);
    const after = await move(tx, r, "REJECTED", decision);
    await queue(tx, after, "admin-decision", "Admin rejected return", "buyer");
    return after;
  });
  await announceHandover(after);
  return after;
}
/** The Agents and orders admin accepts or refuses a buyer-fault return. Acceptance gives the
 * buyer buyerHandoverDays to bring it to the order's agent. */
export async function buyerFaultDecide(
  adminId: string,
  returnId: string,
  accept: boolean,
  note: string,
  now = new Date(),
) {
  if (note.length > 2000) throw new ReturnError("Decision note is too long");
  const after = await locked(adminId, returnId, async (tx, r) => {
    await agentsActor(tx, adminId);
    if (r.status !== "BUYER_REQUESTED" || r.fault !== "BUYER") throw decided();
    const decision = {
      buyerDecidedById: adminId,
      adminId,
      adminDecision: accept,
      adminNote: note.trim() || null,
    };
    if (accept) return toHandover(tx, r, now, decision);
    const after = await move(tx, r, "REJECTED", decision);
    await queue(tx, after, "buyer-decision", "Return refused", "buyer");
    return after;
  });
  await announceHandover(after);
  return after;
}
/** A Factory admin finds a factory-fault return is really the buyer's: no fault is recorded and
 * the Agents and orders admin decides it as a buyer-fault return (DEC-017). */
export async function changeToBuyerFault(
  adminId: string,
  returnId: string,
  note: string,
  now = new Date(),
) {
  if (!note.trim() || note.length > 2000) throw new ReturnError("Add a decision note");
  return locked(adminId, returnId, async (tx, r) => {
    const user = await activeUser(tx, adminId);
    if (user.role !== "ADMIN" || user.adminArea !== "FACTORY")
      throw new ReturnError("Factory admin access required");
    if (r.status !== "WITH_ADMIN" || r.fault !== "FACTORY" || r.adminDecision !== null)
      throw decided();
    const after = await move(tx, r, "BUYER_REQUESTED", {
      fault: "BUYER",
      changedToBuyerAt: now,
      adminNote: note.trim(),
    });
    await queue(tx, after, "changed-to-buyer", "Buyer return requested", "agents");
    await queue(tx, after, "changed-to-buyer", "Return changed to buyer fault", "buyer");
    return after;
  });
}
async function handoverAgent(tx: Tx, agentUserId: string, r: ReturnRequest) {
  const agent = await tx.agent.findFirst({
    where: {
      userId: agentUserId,
      status: { in: AGENT_ACCESS },
      user: { locked: false, role: "AGENT" },
    },
    select: { id: true, userId: true },
  });
  if (!agent || !r.handoverAgentId || agent.id !== r.handoverAgentId)
    throw new ReturnError("Only the handover agent can collect this return");
  return agent;
}
/** The handover agent takes the item from the buyer. Tokens are credited now; for a factory
 * fault the fault is recorded and the return courier waits as a payout deduction. */
export async function collectReturn(agentUserId: string, returnId: string, now = new Date()) {
  return locked(agentUserId, returnId, async (tx, r) => {
    const agent = await handoverAgent(tx, agentUserId, r);
    if (r.status !== "AWAITING_HANDOVER") throw decided();
    if (r.fault === "BUYER") {
      // No tokens and no returnedQty: the agent resells it privately (DEC-017).
      const after = await move(tx, r, "WITH_AGENT", { handedOverAt: now });
      await queue(tx, after, "collected", "Return with agent", "buyer");
      return after;
    }
    const line = await tx.orderLine.findUniqueOrThrow({
      where: { id: r.orderLineId! },
      include: { order: { select: { receivedAt: true } } },
    });
    const returnedQty = line.returnedQty + r.qty;
    if (returnedQty + line.missingQty > line.qty)
      throw new ReturnError("Return quantity exceeds this line");
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        returnedQty,
        ...(returnedQty + line.missingQty === line.qty ? { status: "RETURNED" } : {}),
      },
    });
    const after = await move(tx, r, "HANDED_OVER", { handedOverAt: now });
    const byAdmin = r.adminDecision === true;
    await recordFault(
      tx,
      after,
      byAdmin ? "ADMIN" : "FACTORY",
      (byAdmin ? r.adminId : r.factoryDecidedById) ?? r.factoryId,
      now,
    );
    // Ledger rows in sorted order before either posting.
    await lockLedgerUsers(tx, [r.buyerId, agent.userId]);
    const fee = toD(line.agentFeeEach).times(r.qty);
    const refund = factoryFaultRefund(
      r.qty,
      toD(line.unitPrice),
      toD(line.courierEach),
      toD(line.agentFeeEach),
    );
    await credit(tx, r.buyerId, refund, "RETURN", { returnId: r.id }, "Returned clothing item");
    // The agent gives back the fee for that item: taken from tokens if that week's fee was paid,
    // otherwise left out of the weekly credit, which reads returnedQty (DEC-018).
    const paid = await tx.tokenEntry.findUnique({
      where: { eventKey: agentFeeKey(agent.id, line.order.receivedAt!) },
      select: { id: true },
    });
    if (paid) await takeBackFee(tx, agent, r.id, fee);
    await queue(tx, after, "collected", "Return tokens credited", "buyer");
    return after;
  });
}
/** The agent sold a buyer-fault item, or the buyer took it back unsold. */
async function closeResale(
  agentUserId: string,
  returnId: string,
  to: "SOLD" | "TAKEN_BACK",
  now: Date,
) {
  return locked(agentUserId, returnId, async (tx, r) => {
    await handoverAgent(tx, agentUserId, r);
    if (r.status !== "WITH_AGENT") throw decided();
    return move(tx, r, to, to === "SOLD" ? { resoldAt: now } : { takenBackAt: now });
  });
}
export function markResold(agentUserId: string, returnId: string, now = new Date()) {
  return closeResale(agentUserId, returnId, "SOLD", now);
}
export function markTakenBack(agentUserId: string, returnId: string, now = new Date()) {
  return closeResale(agentUserId, returnId, "TAKEN_BACK", now);
}
/** Accepted returns the buyer never handed over close without tokens; the line earns again. */
export async function lapseReturns(now = new Date()) {
  const rows = await db.returnRequest.findMany({
    where: { status: "AWAITING_HANDOVER", handoverDueAt: { lte: now } },
    select: { id: true },
  });
  let count = 0;
  for (const { id } of rows)
    try {
      await locked(null, id, async (tx, r) => {
        if (r.status !== "AWAITING_HANDOVER" || !r.handoverDueAt || r.handoverDueAt > now) return;
        const after = await move(tx, r, "LAPSED");
        count++;
        await queue(
          tx,
          after,
          "lapsed",
          r.fault === "BUYER" ? "Return not brought" : "Return cancelled",
          "buyer",
        );
      });
    } catch (error) {
      console.error("Return lapse will retry", id, error);
    }
  return count;
}
/** The factory (or a quality admin) receives a return that came back with its courier. */
export async function markReceived(
  staffUserId: string,
  returnId: string,
  restock: boolean,
  note = "",
) {
  if (note.length > 2000) throw new ReturnError("Receipt note is too long");
  return locked(staffUserId, returnId, async (tx, r) => {
    const user = await activeUser(tx, staffUserId);
    if (user.role === "ADMIN") await qualityActor(tx, staffUserId);
    else await factoryActor(tx, staffUserId, r.factoryId);
    if (r.status !== "PICKED_UP" || r.receivedAt) throw decided();
    const received = await move(tx, r, "RECEIVED", {
      receivedAt: new Date(),
      receivedById: staffUserId,
      receivedCondition: note.trim(),
    });
    if (restock) {
      const line = await tx.orderLine.findUniqueOrThrow({
        where: { id: r.orderLineId! },
        select: { variantId: true },
      });
      await tx.variant.update({
        where: { id: line.variantId },
        data: { available: { increment: r.qty } },
      });
    }
    const after = await move(tx, received, "COMPLETED");
    await queue(tx, after, "received", "Return received", "factory");
    return after;
  });
}
export async function escalateOverdue(now = new Date()) {
  const rows = await db.returnRequest.findMany({
    where: { status: "WAITING_FACTORY", fault: "FACTORY", factoryDueAt: { lt: now } },
    select: { id: true },
  });
  let count = 0;
  for (const row of rows)
    try {
      await locked(null, row.id, async (tx, r) => {
        if (r.status !== "WAITING_FACTORY" || !factoryOverdue(r.factoryDueAt, now)) return;
        const after = await move(tx, r, "WITH_ADMIN", { escalatedAt: now });
        count++;
        await queue(tx, after, "overdue", "Return needs review", "admin");
        await queue(tx, after, "overdue", "Return sent to admin", "buyer");
      });
    } catch (error) {
      console.error("Return escalation will retry", row.id, error);
    }
  await flushReturnNotices();
  return count;
}
/** Removal already owns the factory advisory, fencing every return mutation. No ledger/order locks.
 * Undecided returns go to admin; accepted ones keep moving through the agent. */
export async function handoffRemovedReturns(tx: Tx, factoryId: string) {
  const rows = await tx.returnRequest.findMany({
    where: { factoryId, fault: "FACTORY", status: { in: ["WAITING_FACTORY", "ACCEPTED"] } },
    orderBy: { id: "asc" },
  });
  for (const r of rows) {
    await tx.$queryRaw`SELECT 1 FROM "ReturnRequest" WHERE id=${r.id} FOR UPDATE`;
    const fresh = await tx.returnRequest.findUniqueOrThrow({ where: { id: r.id } });
    if (!["WAITING_FACTORY", "ACCEPTED"].includes(fresh.status)) continue;
    const after = await move(tx, fresh, "WITH_ADMIN", { escalatedAt: new Date() });
    await queue(tx, after, "removed", "Return needs review", "admin");
    await queue(tx, after, "removed", "Return sent to admin", "buyer");
  }
}
export async function returnPhotoFor(userId: string, photoId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, locked: false },
    select: {
      id: true,
      role: true,
      adminArea: true,
      factoryId: true,
      factoryRole: true,
      isBrand: true,
    },
  });
  if (!user) return null;
  const photo = await db.returnPhoto.findUnique({
    where: { id: photoId },
    select: {
      storageKey: true,
      contentType: true,
      request: { select: { buyerId: true, factoryId: true, fault: true, changedToBuyerAt: true } },
    },
  });
  if (!photo) return null;
  if (user.id === photo.request.buyerId && isBuyerRole(user.role))
    return { storageKey: photo.storageKey, contentType: photo.contentType };
  const file = { storageKey: photo.storageKey, contentType: photo.contentType };
  // Buyer-fault returns are for the Agents and orders and Core admins only (DEC-017); a Factory
  // admin keeps the photos of a return it changed to buyer fault.
  if (photo.request.fault === "BUYER") {
    if (user.role !== "ADMIN") return null;
    if (user.adminArea === AGENTS_AREA || user.adminArea === "CORE") return file;
    return user.adminArea === "FACTORY" && photo.request.changedToBuyerAt ? file : null;
  }
  if (user.role === "ADMIN" && ["FACTORY", "CORE"].includes(user.adminArea ?? "")) return file;
  try {
    await factoryActor(db, userId, photo.request.factoryId);
  } catch {
    return null;
  }
  return { storageKey: photo.storageKey, contentType: photo.contentType };
}
export async function factoryReturns(userId: string) {
  const user = await activeUser(db, userId),
    factory = factoryOf(user);
  await factoryActor(db, userId, factory.factoryId);
  return db.returnRequest.findMany({
    where: { factoryId: factory.factoryId, fault: "FACTORY" },
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
async function messageActor(tx: Tx, userId: string, r: ReturnRequest) {
  const user = await activeUser(tx, userId);
  if (user.role === "ADMIN") {
    await qualityActor(tx, userId);
    return "admin" as const;
  }
  await factoryActor(tx, userId, r.factoryId);
  return "factory" as const;
}
function messageHref(returnId: string, side: "admin" | "factory") {
  return side === "admin"
    ? `/admin/factory/returns/${returnId}`
    : `/seller/returns?return=${returnId}`;
}
/** The author advisory serializes the global per-user rate limit; return lock fences decisions/read state. */
export async function postReturnMessage(userId: string, returnId: string, body: string) {
  const text = messageText(body);
  return locked(userId, returnId, async (tx, r) => {
    const side = await messageActor(tx, userId, r);
    if (r.status !== "WITH_ADMIN") throw decided();
    const now = new Date();
    await checkMessageRate(tx, userId, now);
    const message = await tx.returnMessage.create({
      data: { returnId, authorId: userId, body: text, createdAt: now },
    });
    await queue(
      tx,
      r,
      `message:${message.id}`,
      "New return message",
      side === "admin" ? "factory" : "admin",
    );
    if (side === "admin")
      await tx.returnNotice.updateMany({
        where: {
          returnId,
          title: "New return message",
          id: { startsWith: `${r.id}:message:${message.id}:` },
        },
        data: { href: messageHref(returnId, "factory") },
      });
    return message;
  });
}
/** Opening a thread reads its unread notice under the same return lock as posting and delivery. */
export async function listReturnMessages(userId: string, returnId: string) {
  return locked(userId, returnId, async (tx, r) => {
    const side = await messageActor(tx, userId, r);
    const now = new Date();
    await readThreadNotice(tx, userId, messageHref(returnId, side), "New return message", now);
    await tx.returnNotice.updateMany({
      where: { returnId, userId, title: "New return message", deliveredAt: null },
      data: { deliveredAt: now },
    });
    const rows = await tx.returnMessage.findMany({
      where: { returnId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
    });
    return rows.reverse();
  });
}
export async function adminReturn(adminId: string, id: string) {
  await assertQualityAdmin(adminId);
  const user = await activeUser(db, adminId);
  return db.returnRequest.findFirst({
    where: { id, ...(user.adminArea === "FACTORY" ? { fault: "FACTORY" } : {}) },
    select: returnSelect,
  });
}
export async function adminReturns(adminId: string) {
  const user = await activeUser(db, adminId);
  const agents = user.role === "ADMIN" && user.adminArea === AGENTS_AREA;
  if (!agents) await assertQualityAdmin(adminId);
  return db.returnRequest.findMany({
    where: agents
      ? { fault: "FACTORY", status: { in: ["AWAITING_HANDOVER", "HANDED_OVER", "PICKED_UP"] } }
      : user.adminArea === "FACTORY"
        ? { fault: "FACTORY" }
        : {},
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
/** Buyer-fault returns and reason counts per product, for the Agents and orders and Core admins. */
export async function buyerFaultHistory(adminId: string) {
  const user = await activeUser(db, adminId);
  if (user.role !== "ADMIN" || ![AGENTS_AREA, "CORE"].includes(user.adminArea ?? ""))
    throw new ReturnError("Agents and orders or Core admin access required");
  const rows = await db.returnRequest.findMany({
    where: { fault: "BUYER" },
    select: {
      ...returnSelect,
      orderLine: {
        select: {
          ...returnSelect.orderLine.select,
          order: { select: { factory: { select: { name: true } } } },
          variant: {
            select: { size: true, product: { select: { id: true, title: true } } },
          },
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  const products = new Map<
    string,
    {
      productId: string;
      title: string;
      factory: string;
      total: number;
      counts: Record<string, number>;
    }
  >();
  for (const r of rows) {
    const p = r.orderLine!.variant.product;
    const entry = products.get(p.id) ?? {
      productId: p.id,
      title: p.title,
      factory: r.orderLine!.order.factory.name,
      total: 0,
      counts: {},
    };
    const reason = r.buyerReason ?? "OTHER";
    entry.counts[reason] = (entry.counts[reason] ?? 0) + r.qty;
    entry.total += r.qty;
    products.set(p.id, entry);
  }
  return { rows, products: [...products.values()].sort((a, b) => b.total - a.total) };
}
export async function buyerReturns(buyerId: string, orderId: string) {
  const user = await activeUser(db, buyerId);
  if (!isBuyerRole(user.role)) throw new ReturnError("Buyer access required");
  return db.returnRequest.findMany({
    where: { buyerId, orderLine: { orderId } },
    select: returnSelect,
    orderBy: { createdAt: "desc" },
  });
}
const returnSelect = {
  id: true,
  orderLineId: true,
  qty: true,
  reason: true,
  buyerReason: true,
  changedToBuyerAt: true,
  resoldAt: true,
  takenBackAt: true,
  fault: true,
  note: true,
  status: true,
  createdAt: true,
  factoryDueAt: true,
  adminDecision: true,
  adminNote: true,
  escalatedAt: true,
  receivedCondition: true,
  receivedAt: true,
  factoryNote: true,
  handoverDueAt: true,
  handedOverAt: true,
  handoverAgent: { select: { address: true, city: true, user: { select: { name: true } } } },
  photos: { select: { id: true } },
  orderLine: {
    select: {
      orderId: true,
      unitPrice: true,
      factoryPrice: true,
      variant: { select: { size: true, product: { select: { title: true } } } },
    },
  },
} as const;
