"use server";

import { revalidatePath } from "next/cache";
import type { FactoryDocKind } from "@/generated/prisma/client";
import { requireAdmin, requireFactory } from "./auth/session";
import {
  FactoryCategoryError,
  requestCategory,
  reviewFactoryCategory,
  reviewFactoryDocument,
  uploadFactoryDocument,
} from "./factory-categories";
import { flash } from "./flash";

export type FactoryCategoryState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function attempt(fn: () => Promise<unknown>, ok: string, paths: string[]) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof FactoryCategoryError) return { error: e.message };
    throw e;
  }
  for (const p of paths) revalidatePath(p);
  await flash(ok);
  return {};
}

/** Owner or Sales asks for a category for their factory. */
export async function requestCategoryAction(
  _p: FactoryCategoryState,
  fd: FormData,
): Promise<FactoryCategoryState> {
  const { factoryId } = await requireFactory("products");
  return attempt(() => requestCategory(factoryId, str(fd, "categoryId")), "Requested", [
    "/seller/categories",
    "/admin/factory/categories",
  ]);
}

export async function uploadFactoryDocumentAction(
  _p: FactoryCategoryState,
  fd: FormData,
): Promise<FactoryCategoryState> {
  const { factoryId } = await requireFactory("products");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  return attempt(
    () => uploadFactoryDocument(factoryId, str(fd, "kind") as FactoryDocKind, file),
    "Sent",
    ["/seller/categories", "/admin/factory/categories"],
  );
}

export async function reviewFactoryCategoryAction(
  _p: FactoryCategoryState,
  fd: FormData,
): Promise<FactoryCategoryState> {
  const admin = await requireAdmin("FACTORY");
  return attempt(
    () =>
      reviewFactoryCategory(admin.id, str(fd, "id"), str(fd, "decision") as "APPROVE" | "REJECT"),
    "Reviewed",
    ["/admin/factory/categories", "/admin/factory"],
  );
}

export async function reviewFactoryDocumentAction(
  _p: FactoryCategoryState,
  fd: FormData,
): Promise<FactoryCategoryState> {
  const admin = await requireAdmin("FACTORY");
  return attempt(
    () =>
      reviewFactoryDocument(admin.id, str(fd, "id"), str(fd, "decision") as "APPROVE" | "REJECT"),
    "Reviewed",
    ["/admin/factory/categories", "/admin/factory"],
  );
}
