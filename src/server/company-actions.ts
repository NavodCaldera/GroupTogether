"use server";

import { redirect } from "next/navigation";
import { type ImageTarget, publishPackVersion, replaceImage, requireCompany } from "./company";
import { AppError } from "./errors";
import { flash } from "./flash";

export type CompanyState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function run(
  work: (companyId: string) => Promise<void>,
  done: string,
): Promise<CompanyState> {
  const companyId = await requireCompany();
  try {
    await work(companyId);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  await flash(done);
  redirect("/company");
}

export async function imageAction(_p: CompanyState, fd: FormData): Promise<CompanyState> {
  const t = str(fd, "target");
  const target: ImageTarget = t === "banner" || t === "logo" ? t : { packId: t };
  return run((id) => replaceImage(id, target, fd.get("file")), "Image updated");
}

export async function packAction(_p: CompanyState, fd: FormData): Promise<CompanyState> {
  // One entry per item row in each list, in row order (a file input with no file sends an empty file).
  const col = (k: string) => fd.getAll(k);
  const [sizes, qtys, retail, kept, files, chilled] = [
    "size",
    "qty",
    "retail",
    "photoUrl",
    "photo",
    "chilled",
  ].map(col);
  const items = col("name").map((n, i) => ({
    name: String(n).trim(),
    size: String(sizes[i] ?? "").trim(),
    qty: Number(qtys[i]),
    retailPrice: String(retail[i] ?? "").trim(),
    chilled: chilled[i] === "yes",
    photo: String(kept[i] ?? "") || null,
    file: files[i] ?? null,
  }));
  return run(
    (id) =>
      publishPackVersion(
        id,
        str(fd, "packId"),
        str(fd, "price"),
        {
          discount5: str(fd, "discount5"),
          discount10: str(fd, "discount10"),
          discount15: str(fd, "discount15"),
        },
        items,
      ),
    "Pack updated",
  );
}
