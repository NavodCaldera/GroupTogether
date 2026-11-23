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
  const sizes = fd.getAll("size").map(String);
  const qtys = fd.getAll("qty").map(Number);
  const items = fd
    .getAll("name")
    .map((n, i) => ({ name: String(n).trim(), size: (sizes[i] ?? "").trim(), qty: qtys[i] }))
    .filter((i) => i.name || i.size);
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
