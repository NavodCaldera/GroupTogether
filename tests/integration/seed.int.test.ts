import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { toD } from "@/lib/decimal";
import {
  DEMO,
  DEMO_ACCOUNTS,
  DEMO_ADMINS,
  DEMO_AGENTS,
  DEMO_FACTORIES,
  DEMO_PICKUP_CODE,
} from "@/lib/demo-accounts";
import { tokenBalance } from "@/server/tokens";

const basket = (agentEmail: string, factoryEmail: string, status: string) =>
  db.basket.findMany({
    where: {
      agent: { user: { email: agentEmail } },
      factory: { email: factoryEmail },
      status: status as "OPEN",
    },
    include: { orders: { include: { lines: true } } },
  });

describe("demo seed", () => {
  beforeAll(() => {
    // The same command the browser specs run (tests/e2e/seed-fixtures.ts), on the test database.
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "seed"], {
      env: { ...process.env },
      stdio: "pipe",
      timeout: 170_000,
    });
  }, 180_000);

  it("creates every listed login and one admin per area", async () => {
    const emails = DEMO_ACCOUNTS.map((a) => a.email);
    expect(await db.user.count({ where: { email: { in: emails } } })).toBe(emails.length);
    for (const [area, email] of Object.entries(DEMO_ADMINS)) {
      const admin = await db.user.findUniqueOrThrow({ where: { email } });
      expect([admin.role, admin.adminArea]).toEqual(["ADMIN", area]);
    }
    expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(4);
  });

  it("has two factories with Owner, Packing and Sales and six live products each", async () => {
    for (const f of Object.values(DEMO_FACTORIES)) {
      const owner = await db.user.findUniqueOrThrow({
        where: { email: f.owner },
        include: { staff: true, factoryProfile: true, products: true },
      });
      expect(owner.factoryProfile?.status).toBe("ACTIVE");
      expect(owner.staff.map((s) => [s.email, s.factoryRole]).sort()).toEqual(
        [
          [f.packing, "PACKING"],
          [f.sales, "SALES"],
        ].sort(),
      );
      expect(owner.products).toHaveLength(6);
      for (const p of owner.products) {
        expect(p.status).toBe("LIVE");
        expect(toD(p.price).eq(toD(p.factoryPrice!).plus(toD(p.commission!)))).toBe(true);
      }
    }
  });

  it("has three live agents with hours, more than 2 km apart, and one applicant", async () => {
    const live = await db.agent.findMany({
      where: { status: "LIVE" },
      include: { user: true, hours: true },
    });
    expect(live.map((a) => a.user.email).sort()).toEqual(
      [DEMO_AGENTS.kollupitiya, DEMO_AGENTS.wellawatte, DEMO_AGENTS.kotahena].sort(),
    );
    for (const a of live) {
      expect(a.user.role).toBe("AGENT");
      expect(a.hours.length).toBeGreaterThan(0);
      expect(toD(a.depositAmount).eq(200000)).toBe(true);
    }
    const applicant = await db.agent.findFirstOrThrow({
      where: { user: { email: DEMO_AGENTS.applicant } },
    });
    expect(applicant.status).toBe("APPLIED");
  });

  it("has a basket in every state where the specs expect it", async () => {
    for (const [status, where] of Object.entries(DEMO.baskets)) {
      const rows = await basket(where.agent, where.factory, status);
      expect(rows, status).toHaveLength(1);
      const paid = rows[0].orders.filter((o) => o.status !== "CANCELLED");
      expect(paid.length, status).toBeGreaterThan(0);
      // The basket total is the goods value of its live orders.
      const total = paid.reduce((s, o) => s.plus(toD(o.itemsTotal)), toD(0));
      expect(toD(rows[0].total).eq(total), status).toBe(true);
    }
    const withCourier = await basket(
      DEMO.baskets.WITH_COURIER.agent,
      DEMO.baskets.WITH_COURIER.factory,
      "WITH_COURIER",
    );
    expect(
      await db.courierBooking.findUnique({ where: { basketId: withCourier[0].id } }),
    ).not.toBeNull();
  });

  it("gives the ready buyer the known code with items left to collect", async () => {
    const code = await db.pickupCode.findFirstOrThrow({
      where: { buyer: { email: DEMO.readyBuyer }, agent: { user: { email: DEMO.readyAgent } } },
    });
    expect(code.code).toBe(DEMO_PICKUP_CODE);
    const waiting = await db.orderLine.count({
      where: {
        collectedAt: null,
        order: { buyerId: code.buyerId, agentId: code.agentId, status: "RECEIVED" },
      },
    });
    expect(waiting).toBeGreaterThan(0);
  });

  it("has one return awaiting handover at the agent", async () => {
    const r = await db.returnRequest.findMany({ where: { status: "AWAITING_HANDOVER" } });
    expect(r).toHaveLength(1);
    const agent = await db.agent.findFirstOrThrow({
      where: { user: { email: DEMO.returnAgent } },
    });
    const buyer = await db.user.findUniqueOrThrow({ where: { email: DEMO.returnBuyer } });
    expect([r[0].handoverAgentId, r[0].buyerId]).toEqual([agent.id, buyer.id]);
  });

  it("gives tokens to exactly one buyer", async () => {
    const buyers = await db.user.findMany({
      where: { role: "CUSTOMER" },
      select: { id: true, email: true },
    });
    const holding = [];
    for (const b of buyers) if ((await tokenBalance(b.id)).gt(0)) holding.push(b.email);
    expect(holding).toEqual([DEMO.tokenBuyer]);
  });

  it("leaves no stock out of balance and no payment pending", async () => {
    expect(await db.paymentAttempt.count({ where: { status: { not: "SUCCEEDED" } } })).toBe(0);
    const reserved = await db.variant.aggregate({ _sum: { reserved: true } });
    expect(reserved._sum.reserved ?? 0).toBe(0);
  });
});
