import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const principal = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; adminArea?: string | null; locked?: boolean },
}));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { db } from "@/server/db";
import {
  PartnerError,
  submitApplication,
  createInvite,
  reviewApplication,
  recordVisit,
  redeemApprovalLink,
} from "@/server/partners";
import { GET } from "@/app/api/partner-docs/[id]/route";
import { makeUser, resetDb, slipFile } from "./helpers";
const input = {
  businessName: "Lanka Shirts",
  brNumber: "BR123",
  ownerName: "Kamal Perera",
  ownerNic: "901234567V",
  phone: "0771234567",
  email: "kamal@example.lk",
  address: "1 Factory Road",
  city: "Colombo",
  bankName: "BOC",
  bankBranch: "Colombo",
  accountName: "Kamal Perera",
  accountNumber: "123",
};
const files = () =>
  (["BR_CERT", "NIC_PHOTO", "FACTORY_PHOTO"] as const).map((kind) => ({ kind, file: slipFile() }));
beforeEach(async () => {
  principal.user = null;
  await resetDb();
});
afterAll(() => db.$disconnect());
describe("factory applications", () => {
  it("names missing NIC photo with PartnerError", async () => {
    const promise = submitApplication(
      input,
      files().filter((f) => f.kind !== "NIC_PHOTO"),
    );
    await expect(promise).rejects.toBeInstanceOf(PartnerError);
    await expect(promise).rejects.toThrow("NIC photo");
  });
  it.each(["brNumber", "ownerNic"] as const)("blocks a rejected %s", async (field) => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    await reviewApplication(admin.id, a.id, "REJECT", "Rejected");
    await expect(
      submitApplication(
        { ...input, [field === "brNumber" ? "ownerNic" : "brNumber"]: "OTHER" },
        files(),
      ),
    ).rejects.toThrow(/rejected/i);
  });
  it("refuses approval on a bank mismatch", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication({ ...input, accountName: "Someone else" }, files());
    await expect(reviewApplication(admin.id, a.id, "APPROVE")).rejects.toThrow(/bank/i);
  });
  it("approves once, creates seller/profile and sign-in notice", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    await recordVisit(admin.id, a.id, new Date("2026-11-05"), "Visited");
    await reviewApplication(admin.id, a.id, "APPROVE");
    const app = await db.factoryApplication.findUniqueOrThrow({ where: { id: a.id } });
    expect(app).toMatchObject({ status: "APPROVED", reviewerId: admin.id, visitNotes: "Visited" });
    const seller = await db.user.findUniqueOrThrow({
      where: { id: app.factoryUserId! },
      include: { factoryProfile: true },
    });
    expect(seller).toMatchObject({
      role: "SELLER",
      factoryProfile: { status: "ACTIVE", complianceDueAt: null },
    });
    expect(
      await db.notification.count({
        where: { userId: seller.id, title: "Factory application approved" },
      }),
    ).toBe(1);
    const notice = await db.notification.findFirstOrThrow({ where: { userId: seller.id } });
    const token = notice.href!.split("/").at(-1)!;
    expect(await redeemApprovalLink(token)).toBe(seller.id);
    await expect(redeemApprovalLink(token)).rejects.toThrow();
    await expect(reviewApplication(admin.id, a.id, "APPROVE")).rejects.toThrow(/reviewed/i);
  });
  it("validates invite expiry, one-time use and admin boundaries", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const buyer = await makeUser();
    await expect(createInvite(buyer.id, { email: input.email })).rejects.toThrow();
    const { token } = await createInvite(admin.id, { email: input.email });
    const invite = await db.factoryInvite.findUniqueOrThrow({ where: { token } });
    expect(invite.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.99 * 86400000);
    await submitApplication(input, files(), token);
    await expect(submitApplication(input, files(), token)).rejects.toThrow(/invite/i);
    const expired = await createInvite(admin.id, { phone: input.phone });
    await db.factoryInvite.update({
      where: { token: expired.token },
      data: { expiresAt: new Date(0) },
    });
    await expect(submitApplication(input, files(), expired.token)).rejects.toThrow(/invite/i);
  });
  it("serializes invite redemption", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const { token } = await createInvite(admin.id, { email: input.email });
    const results = await Promise.allSettled([
      submitApplication(input, files(), token),
      submitApplication(input, files(), token),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("denies review and visit to other areas", async () => {
    const admin = await makeUser("ADMIN", "PREMIUM");
    const a = await submitApplication(input, files());
    await expect(reviewApplication(admin.id, a.id, "APPROVE")).rejects.toThrow();
    await expect(recordVisit(admin.id, a.id, new Date(), "visit")).rejects.toThrow();
  });
  it("serves documents only to FACTORY and CORE admins", async () => {
    const a = await submitApplication(input, files());
    const doc = await db.factoryDocument.findFirstOrThrow({ where: { applicationId: a.id } });
    const request = () =>
      GET(new Request("http://localhost/api/partner-docs/" + doc.id), {
        params: Promise.resolve({ id: doc.id }),
      });
    expect((await request()).status).toBe(404);
    const buyer = await makeUser();
    principal.user = buyer;
    expect((await request()).status).toBe(404);
    principal.user = await db.user.update({ where: { id: buyer.id }, data: { role: "SELLER" } });
    expect((await request()).status).toBe(404);
    for (const area of ["PREMIUM", "WAREHOUSE", "FACTORY", "CORE"] as const) {
      principal.user = await makeUser("ADMIN", area);
      const response = await request();
      expect(response.status).toBe(area === "FACTORY" || area === "CORE" ? 200 : 404);
      if (response.status === 200) {
        expect(response.headers.get("Cache-Control")).toContain("no-store");
        expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
      }
    }
  });
  it("links existing owners only through their authenticated identity", async () => {
    const buyer = await makeUser();
    const owner = await db.user.update({
      where: { id: buyer.id },
      data: { role: "SELLER", email: input.email, phone: input.phone },
    });
    await db.factoryProfile.create({
      data: { factoryUserId: owner.id, complianceDueAt: new Date() },
    });
    principal.user = owner;
    const a = await submitApplication(input, files());
    const admin = await makeUser("ADMIN", "FACTORY");
    await reviewApplication(admin.id, a.id, "APPROVE");
    expect(
      (await db.factoryApplication.findUniqueOrThrow({ where: { id: a.id } })).factoryUserId,
    ).toBe(owner.id);
    expect(await db.user.count({ where: { role: "SELLER" } })).toBe(1);
  });
});
