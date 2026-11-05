import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const principal = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; adminArea?: string | null; locked?: boolean },
}));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { readFile } from "node:fs/promises";
import { hashPassword } from "@/server/auth/password";
import { authenticate, hashToken, userForToken, startSession } from "@/server/auth/service";
import { db } from "@/server/db";
import {
  PartnerError,
  submitApplication,
  createInvite,
  reviewApplication,
  recordVisit,
  redeemApprovalLink,
  issueActivationLink,
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
    const approval = await reviewApplication(admin.id, a.id, "APPROVE");
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
    const token = approval.activationUrl!.split("/").at(-1)!;
    expect(notice.href).toBe("/sign-in");
    expect(await db.session.count({ where: { userId: seller.id } })).toBe(0);
    expect(await userForToken(token)).toBeNull();
    expect(await userForToken(hashToken(token))).toBeNull();
    expect(await db.notification.count({ where: { href: { contains: token } } })).toBe(0);
    expect(
      await db.factoryActivation.findUnique({ where: { id: hashToken(token) } }),
    ).toMatchObject({ userId: seller.id, createdById: admin.id, usedAt: null });
    expect(await redeemApprovalLink(token, "ownerpassword123")).toBe(seller.id);
    expect((await authenticate(seller.email, "ownerpassword123")).id).toBe(seller.id);
    await expect(redeemApprovalLink(token, "ownerpassword123")).rejects.toThrow(
      "Sign-in link expired or already used",
    );
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
  it("refuses expired activations", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    const { activationUrl } = await reviewApplication(admin.id, a.id, "APPROVE");
    const token = activationUrl!.split("/").at(-1)!;
    await db.factoryActivation.update({
      where: { id: hashToken(token) },
      data: { expiresAt: new Date(0) },
    });
    await expect(redeemApprovalLink(token, "ownerpassword123")).rejects.toThrow(
      "Sign-in link expired or already used",
    );
  });
  it("replaces unused links and only redeems the fresh activation", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    const old = await reviewApplication(admin.id, a.id, "APPROVE");
    const fresh = await issueActivationLink(admin.id, a.id);
    await expect(
      redeemApprovalLink(old.activationUrl!.split("/").at(-1)!, "ownerpassword123"),
    ).rejects.toThrow("Sign-in link expired or already used");
    expect(
      await redeemApprovalLink(fresh.activationUrl.split("/").at(-1)!, "ownerpassword123"),
    ).toBeTruthy();
  });
  it("never issues activations or changes passwords for authenticated legacy owners", async () => {
    const created = await makeUser();
    const owner = await db.user.update({
      where: { id: created.id },
      data: { role: "SELLER", passwordHash: await hashPassword("legacy-password123") },
    });
    principal.user = owner;
    const a = await submitApplication(input, files());
    const admin = await makeUser("ADMIN", "FACTORY");
    expect(await reviewApplication(admin.id, a.id, "APPROVE")).toEqual({});
    expect(await db.factoryActivation.count({ where: { userId: owner.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe(
      owner.passwordHash,
    );
    expect((await authenticate(owner.email, "legacy-password123")).id).toBe(owner.id);
    await expect(issueActivationLink(admin.id, a.id)).rejects.toThrow(
      "Existing factory owners sign in with their password",
    );
  });
  it("restricts fresh links to unlocked FACTORY/CORE admins and approved applications", async () => {
    const factory = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    await expect(issueActivationLink(factory.id, a.id)).rejects.toThrow("Application not approved");
    await reviewApplication(factory.id, a.id, "APPROVE");
    for (const admin of [
      await makeUser(),
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN", "WAREHOUSE"),
    ]) {
      await expect(issueActivationLink(admin.id, a.id)).rejects.toThrow(
        "Factories admin access required",
      );
    }
    const locked = await makeUser("ADMIN", "CORE");
    await db.user.update({ where: { id: locked.id }, data: { locked: true } });
    await expect(issueActivationLink(locked.id, a.id)).rejects.toThrow(
      "Factories admin access required",
    );
    const core = await makeUser("ADMIN", "CORE");
    expect((await issueActivationLink(core.id, a.id)).activationUrl).toMatch(
      /^\/factories\/sign-in\/partner_/,
    );
  });
  it("serializes two redemptions so only one changes the password", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const a = await submitApplication(input, files());
    const { activationUrl } = await reviewApplication(admin.id, a.id, "APPROVE");
    const token = activationUrl!.split("/").at(-1)!;
    const results = await Promise.allSettled([
      redeemApprovalLink(token, "password-one"),
      redeemApprovalLink(token, "password-two"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    expect(failed?.status === "rejected" && failed.reason.message).toBe(
      "Sign-in link expired or already used",
    );
  });
  it("migration revokes exact approval sessions while preserving ordinary sessions and legacy passwords", async () => {
    const admin = await makeUser("ADMIN", "FACTORY");
    const apps: string[] = [];
    const owners: string[] = [];
    const tokens = ["partner_old-new-owner", "partner_old-legacy-owner"];
    for (let i = 0; i < 2; i++) {
      const owner = await db.user.update({
        where: { id: (await makeUser()).id },
        data: { role: "SELLER", createdAt: new Date(i === 0 ? "2021-01-01" : "2019-01-01") },
      });
      owners.push(owner.id);
      const app = await db.factoryApplication.create({
        data: {
          ...input,
          brNumber: `migration-${i}`,
          ownerNic: `migration-${i}`,
          factoryUserId: owner.id,
          reviewerId: admin.id,
          status: "APPROVED",
          createdAt: new Date("2020-01-01"),
        },
      });
      apps.push(app.id);
      await db.session.create({
        data: { id: hashToken(tokens[i]), userId: owner.id, expiresAt: new Date("2099-01-01") },
      });
      await db.notification.create({
        data: {
          userId: owner.id,
          title: "Factory application approved",
          body: "Sign in to accept the agreement.",
          href: `/factories/sign-in/${tokens[i]}`,
        },
      });
    }
    const normal = await startSession(owners[0]);
    const migration = await readFile(
      "prisma/migrations/20261105100000_factory_activation_tokens/migration.sql",
      "utf8",
    );
    // Execute only the fixed migration data statements, against the guarded disposable database.
    const dataSql = migration.slice(migration.indexOf("-- Preserve only invalidated"));
    for (const sql of dataSql.split(";").filter((statement) => statement.trim()))
      await db.$executeRawUnsafe(sql);
    for (const token of tokens) {
      expect(await userForToken(token)).toBeNull();
      await expect(redeemApprovalLink(token, "ownerpassword123")).rejects.toThrow(
        "Sign-in link expired or already used",
      );
    }
    expect(await userForToken(normal.token)).toMatchObject({ id: owners[0] });
    expect(
      await db.factoryActivation.findUnique({ where: { id: hashToken(tokens[0]) } }),
    ).toMatchObject({ userId: owners[0], usedAt: expect.any(Date) });
    expect(await db.factoryActivation.count({ where: { userId: owners[1] } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: owners[1] } })).passwordHash).toBe("x");
    expect(
      await db.notification.count({ where: { href: { startsWith: "/factories/sign-in/" } } }),
    ).toBe(0);
    expect((await issueActivationLink(admin.id, apps[0])).activationUrl).toContain("partner_");
    await expect(issueActivationLink(admin.id, apps[1])).rejects.toThrow(
      "Existing factory owners sign in with their password",
    );
  });
});
