import "server-only";
import type { FactoryDocKind } from "@/generated/prisma/client";
import { DOCUMENT_LABELS, WORKSPACE_DOCUMENTS } from "@/lib/partner-rules";
import { categoryLabel, isActive } from "@/lib/categories";
import { coveredBy, needsLicence } from "@/lib/factory-categories";
import { db, type Tx } from "./db";
import { loadCategoryTree } from "./categories";
import { notify } from "./notify";
import {
  IMAGE_TYPES,
  PDF_MAX_BYTES,
  PDF_TYPES,
  UploadError,
  checkUpload,
  saveUpload,
} from "./storage";

/**
 * Which categories a factory may list in (CATG-003, DEC-029). A factory asks for a category from
 * its workspace; a Factories admin approves or rejects. Approval covers the subtree. Restricted
 * categories (needsApproval, inherited) also need an approved product licence.
 */
export class FactoryCategoryError extends Error {}

const DOC_TYPES = { ...IMAGE_TYPES, ...PDF_TYPES };

/** An unlocked admin of the Factories area. */
export async function assertFactoryAdmin(adminId: string) {
  const ok = await db.user.count({
    where: { id: adminId, role: "ADMIN", locked: false, adminArea: "FACTORY" },
  });
  if (!ok) throw new FactoryCategoryError("Factories admin access required");
}

/** The factory owner account (not staff, not a brand). */
async function assertFactory(factoryId: string) {
  const ok = await db.user.count({
    where: { id: factoryId, role: "SELLER", factoryId: null, isBrand: false, locked: false },
  });
  if (!ok) throw new FactoryCategoryError("Factory not found");
}

export async function approvedCategoryIds(factoryId: string, client: Tx = db) {
  const rows = await client.factoryCategory.findMany({
    where: { factoryId, status: "APPROVED" },
    select: { categoryId: true },
  });
  return rows.map((r) => r.categoryId);
}

/** Is the factory approved for the category or one above it? */
export async function coversCategory(client: Tx, factoryId: string, categoryId: string) {
  return coveredBy(
    await loadCategoryTree(),
    await approvedCategoryIds(factoryId, client),
    categoryId,
  );
}

/** A factory asks to list in a category. A rejected request may be asked again. */
export async function requestCategory(factoryId: string, categoryId: string) {
  await assertFactory(factoryId);
  const tree = await loadCategoryTree();
  if (!tree.get(categoryId) || !isActive(tree, categoryId))
    throw new FactoryCategoryError("Choose a category");
  const rows = await db.factoryCategory.findMany({
    where: { factoryId },
    select: { categoryId: true, status: true },
  });
  const approved = rows.filter((r) => r.status === "APPROVED").map((r) => r.categoryId);
  if (coveredBy(tree, approved, categoryId)) throw new FactoryCategoryError("Already approved");
  const existing = rows.find((r) => r.categoryId === categoryId);
  if (existing?.status === "PENDING") throw new FactoryCategoryError("Already requested");
  return db.factoryCategory.upsert({
    where: { factoryId_categoryId: { factoryId, categoryId } },
    create: { factoryId, categoryId },
    update: { status: "PENDING", approvedById: null, reviewedAt: null },
    select: { id: true },
  });
}

/** Approves or rejects a pending request. Restricted categories need an approved licence. */
export async function reviewFactoryCategory(
  adminId: string,
  id: string,
  decision: "APPROVE" | "REJECT",
) {
  await assertFactoryAdmin(adminId);
  if (decision !== "APPROVE" && decision !== "REJECT")
    throw new FactoryCategoryError("Choose approve or reject");
  const tree = await loadCategoryTree();
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "FactoryCategory" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.factoryCategory.findUnique({
      where: { id },
      select: { factoryId: true, categoryId: true, status: true },
    });
    if (!r) throw new FactoryCategoryError("Request not found");
    if (r.status !== "PENDING") throw new FactoryCategoryError("Request already reviewed");
    if (
      decision === "APPROVE" &&
      needsLicence(tree, r.categoryId) &&
      !(await hasApprovedDocument(tx, r.factoryId, "PRODUCT_LICENCE"))
    )
      throw new FactoryCategoryError("Approve a product licence for this factory first");
    await tx.factoryCategory.update({
      where: { id },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedById: adminId,
        reviewedAt: new Date(),
      },
    });
    return r;
  });
  await notify([row.factoryId], {
    title: decision === "APPROVE" ? "Category approved" : "Category not approved",
    body: categoryLabel(tree, row.categoryId),
    href: "/seller/categories",
  });
}

async function hasApprovedDocument(tx: Tx, factoryId: string, kind: FactoryDocKind) {
  return (
    (await tx.factoryDocument.count({
      where: {
        kind,
        status: "APPROVED",
        OR: [{ factoryId }, { application: { factoryUserId: factoryId, status: "APPROVED" } }],
      },
    })) > 0
  );
}

/** A factory adds a product licence or trademark proof (image or PDF) for review. */
export async function uploadFactoryDocument(factoryId: string, kind: FactoryDocKind, file: File) {
  await assertFactory(factoryId);
  if (!WORKSPACE_DOCUMENTS.includes(kind)) throw new FactoryCategoryError("Choose a document");
  try {
    checkUpload(file, DOC_TYPES, DOCUMENT_LABELS[kind], PDF_MAX_BYTES);
  } catch (e) {
    if (e instanceof UploadError) throw new FactoryCategoryError(e.message);
    throw e;
  }
  if ((await db.factoryDocument.count({ where: { factoryId, status: "PENDING" } })) >= 10)
    throw new FactoryCategoryError("Wait for your documents to be reviewed");
  const saved = await saveUpload(file, "partner-docs", DOC_TYPES);
  return db.factoryDocument.create({
    data: { factoryId, kind, ...saved },
    select: { id: true },
  });
}

/** Approves or rejects a pending workspace document. */
export async function reviewFactoryDocument(
  adminId: string,
  id: string,
  decision: "APPROVE" | "REJECT",
) {
  await assertFactoryAdmin(adminId);
  if (decision !== "APPROVE" && decision !== "REJECT")
    throw new FactoryCategoryError("Choose approve or reject");
  const r = await db.factoryDocument.updateMany({
    where: { id, status: "PENDING", factoryId: { not: null } },
    data: {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  });
  if (!r.count) throw new FactoryCategoryError("Document not found or already reviewed");
}

/** The factory's own requests and documents, for its workspace. */
export async function factoryCategoryView(factoryId: string) {
  const tree = await loadCategoryTree();
  const [requests, documents] = await Promise.all([
    db.factoryCategory.findMany({
      where: { factoryId },
      select: { id: true, categoryId: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.factoryDocument.findMany({
      where: { factoryId },
      select: { id: true, kind: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    requests: requests.map((r) => ({ ...r, label: categoryLabel(tree, r.categoryId) })),
    documents,
  };
}

/** Pending requests and workspace documents for the Factories admin. */
export async function pendingFactoryReviews(adminId: string) {
  await assertFactoryAdmin(adminId);
  const tree = await loadCategoryTree();
  const [requests, documents] = await Promise.all([
    db.factoryCategory.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        categoryId: true,
        createdAt: true,
        factory: { select: { id: true, company: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    db.factoryDocument.findMany({
      where: { status: "PENDING", factoryId: { not: null } },
      select: {
        id: true,
        kind: true,
        createdAt: true,
        factory: { select: { id: true, company: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
  ]);
  return {
    requests: requests.map((r) => ({
      ...r,
      label: categoryLabel(tree, r.categoryId),
      needsLicence: needsLicence(tree, r.categoryId),
    })),
    documents,
  };
}

export async function pendingFactoryReviewCount() {
  const [a, b] = await Promise.all([
    db.factoryCategory.count({ where: { status: "PENDING" } }),
    db.factoryDocument.count({ where: { status: "PENDING", factoryId: { not: null } } }),
  ]);
  return a + b;
}
