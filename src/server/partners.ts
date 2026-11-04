import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { FactoryDocKind } from "@/generated/prisma/client";
import {
  APPLICATION_FIELDS,
  DOCUMENT_LABELS,
  bankNameMatches,
  missingItems,
  normalizedIdentity,
  type ApplicationInput,
} from "@/lib/partner-rules";
import { db } from "./db";
import { getCurrentUser } from "./auth/session";
import { hashPassword } from "./auth/password";
import { hashToken, phoneSchema } from "./auth/service";
import { notify } from "./notify";
import { checkUpload, saveUpload, IMAGE_TYPES, UploadError } from "./storage";
export class PartnerError extends Error {}
export async function assertPartnerAdmin(adminId: string) {
  const user = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, adminArea: true, locked: true },
  });
  if (
    !user ||
    user.locked ||
    user.role !== "ADMIN" ||
    !["FACTORY", "CORE"].includes(user.adminArea ?? "")
  )
    throw new PartnerError("Factories admin access required");
}
export async function submitApplication(
  input: ApplicationInput,
  files: { kind: FactoryDocKind; file: File }[],
  inviteToken?: string,
): Promise<{ id: string }> {
  const missing = missingItems(
    input,
    files.filter((f) => f.file.size > 0).map((f) => f.kind),
  );
  if (missing.length) throw new PartnerError(`Missing: ${missing.join(", ")}`);
  const data = Object.fromEntries(
    APPLICATION_FIELDS.map(([k]) => [k, input[k].trim()]),
  ) as ApplicationInput;
  if (Object.values(data).some((v) => v.length > 500))
    throw new PartnerError("Application fields must be 500 characters or fewer");
  const email = z.email().safeParse(data.email.toLowerCase());
  const phone = phoneSchema.safeParse(data.phone);
  if (!email.success || !phone.success)
    throw new PartnerError("Enter a valid email and mobile number");
  data.email = email.data;
  data.phone = phone.data;
  data.brNumber = normalizedIdentity(data.brNumber);
  data.ownerNic = normalizedIdentity(data.ownerNic);
  if (!data.brNumber || !data.ownerNic)
    throw new PartnerError("Enter BR number and owner NIC number");
  if (files.length > 12) throw new PartnerError("Choose at most 12 documents");
  for (const f of files) {
    if (!DOCUMENT_LABELS[f.kind]) throw new PartnerError("Invalid document kind");
    try {
      checkUpload(f.file, IMAGE_TYPES, DOCUMENT_LABELS[f.kind]);
    } catch (e) {
      if (e instanceof UploadError) throw new PartnerError(e.message);
      throw e;
    }
  }
  const session = await getCurrentUser();
  const owner = session
    ? await db.user.findFirst({
        where: { id: session.id, role: "SELLER", factoryId: null, isBrand: false, locked: false },
        select: { id: true },
      })
    : null;
  const saved = await Promise.all(
    files.map(async (f) => ({
      kind: f.kind,
      ...(await saveUpload(f.file, "partner-docs", IMAGE_TYPES)),
    })),
  );
  return db.$transaction(async (tx) => {
    // Submission and rejection share this lock: an identity cannot race a rejection.
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(731901)) AS l`;
    if (
      await tx.factoryApplication.count({
        where: {
          status: "REJECTED",
          OR: [{ brNumber: data.brNumber }, { ownerNic: data.ownerNic }],
        },
      })
    )
      throw new PartnerError("This BR number or owner NIC belongs to a rejected application");
    let inviteId: string | undefined;
    if (inviteToken) {
      const invite = await tx.factoryInvite.findUnique({ where: { token: inviteToken } });
      if (!invite || invite.usedAt || invite.expiresAt <= new Date())
        throw new PartnerError("This invite is expired or already used");
      const used = await tx.factoryInvite.updateMany({
        where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!used.count) throw new PartnerError("This invite is expired or already used");
      inviteId = invite.id;
    }
    if (
      owner &&
      (await tx.factoryApplication.count({
        where: { factoryUserId: owner.id, status: { in: ["WAITING", "APPROVED"] } },
      }))
    )
      throw new PartnerError("Your application is already submitted");
    return tx.factoryApplication.create({
      data: { ...data, inviteId, factoryUserId: owner?.id, documents: { create: saved } },
      select: { id: true },
    });
  });
}
export async function createInvite(
  adminId: string,
  contact: { phone?: string; email?: string },
): Promise<{ token: string }> {
  await assertPartnerAdmin(adminId);
  const email = contact.email?.trim().toLowerCase();
  const phone = contact.phone ? phoneSchema.safeParse(contact.phone) : null;
  if (
    (!email && !phone) ||
    (email && !z.email().safeParse(email).success) ||
    (phone && !phone.success)
  )
    throw new PartnerError("Enter a valid email or mobile number");
  return db.factoryInvite.create({
    data: {
      token: randomBytes(32).toString("base64url"),
      email: email || null,
      phone: phone?.success ? phone.data : null,
      invitedBy: adminId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
    select: { token: true },
  });
}
export async function reviewApplication(
  adminId: string,
  id: string,
  decision: "APPROVE" | "REJECT",
  note?: string,
): Promise<void> {
  await assertPartnerAdmin(adminId);
  if (!["APPROVE", "REJECT"].includes(decision)) throw new PartnerError("Choose approve or reject");
  if ((note?.length ?? 0) > 2000) throw new PartnerError("Use at most 2000 characters");
  const token = `partner_${randomBytes(32).toString("base64url")}`;
  const passwordHash =
    decision === "APPROVE" ? await hashPassword(randomBytes(32).toString("base64url")) : "";
  const userId = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(731901)) AS l`;
    await tx.$queryRaw`SELECT 1 FROM "FactoryApplication" WHERE id = ${id} FOR UPDATE`;
    const a = await tx.factoryApplication.findUnique({
      where: { id },
      include: { documents: { select: { kind: true } } },
    });
    if (!a) throw new PartnerError("Application not found");
    if (a.status !== "WAITING") throw new PartnerError("Application already reviewed");
    let factoryUserId = a.factoryUserId;
    if (decision === "APPROVE") {
      const missing = missingItems(
        a,
        a.documents.map((d) => d.kind),
      );
      if (missing.length) throw new PartnerError(`Missing: ${missing.join(", ")}`);
      if (!bankNameMatches(a.accountName, a.businessName, a.ownerName))
        throw new PartnerError("Bank account name must match the business or owner name");
      if (factoryUserId) {
        const owner = await tx.user.findFirst({
          where: {
            id: factoryUserId,
            role: "SELLER",
            isBrand: false,
            factoryId: null,
            locked: false,
          },
          select: { id: true },
        });
        if (!owner) throw new PartnerError("Factory owner not found");
      } else {
        if (await tx.user.count({ where: { OR: [{ email: a.email }, { phone: a.phone }] } }))
          throw new PartnerError("An account already uses this email or mobile number");
        const owner = await tx.user.create({
          data: {
            role: "SELLER",
            name: a.ownerName,
            company: a.businessName,
            email: a.email,
            phone: a.phone,
            address: a.address,
            city: a.city,
            passwordHash,
          },
          select: { id: true },
        });
        factoryUserId = owner.id;
      }
      await tx.factoryProfile.upsert({
        where: { factoryUserId },
        create: { factoryUserId, status: "ACTIVE" },
        update: {},
      });
      await tx.session.create({
        data: {
          id: hashToken(token),
          userId: factoryUserId,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
    }
    await tx.factoryApplication.update({
      where: { id },
      data: {
        factoryUserId,
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewerId: adminId,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
    return decision === "APPROVE" ? factoryUserId : null;
  });
  if (userId)
    await notify([userId], {
      title: "Factory application approved",
      body: "Sign in to accept the agreement.",
      href: `/factories/sign-in/${token}`,
    });
}
export async function recordVisit(
  adminId: string,
  id: string,
  date: Date,
  notes: string,
): Promise<void> {
  await assertPartnerAdmin(adminId);
  if (!Number.isFinite(date.getTime()) || notes.length > 2000)
    throw new PartnerError("Enter a valid visit date and up to 2000 characters");
  const changed = await db.factoryApplication.updateMany({
    where: { id, status: "WAITING" },
    data: { visitDate: date, visitNotes: notes.trim() },
  });
  if (!changed.count) throw new PartnerError("Application not found or already reviewed");
}
/** Exchange the approval link once; GET/prefetch never consumes it. */
export async function redeemApprovalLink(token: string): Promise<string> {
  if (!token.startsWith("partner_")) throw new PartnerError("Invalid sign-in link");
  return db.$transaction(async (tx) => {
    const id = hashToken(token);
    await tx.$queryRaw`SELECT 1 FROM "Session" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.session.findFirst({
      where: {
        id,
        expiresAt: { gt: new Date() },
        user: { role: "SELLER", locked: false, factoryId: null, isBrand: false },
      },
      select: { userId: true },
    });
    if (!row) throw new PartnerError("Sign-in link expired or already used");
    await tx.session.delete({ where: { id } });
    return row.userId;
  });
}
