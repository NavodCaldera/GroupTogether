"use server";

import { revalidatePath } from "next/cache";
import { MAX_TIERS } from "@/lib/deal-rules";
import { requireFactory } from "./auth/session";
import { DealError, discardDeal, saveDealDraft, startDeal } from "./deals";
import { flash } from "./flash";

export type DealState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(productId: string) {
  revalidatePath(`/seller/products/${productId}`);
  revalidatePath(`/products/${productId}`);
}

async function run(work: () => Promise<void>, done: string): Promise<DealState> {
  try {
    await work();
  } catch (e) {
    if (e instanceof DealError) return { error: e.message };
    throw e;
  }
  await flash(done);
  return {};
}

/** Factory Owner/Sales: saves a DRAFT deal with its tiers (DEAL-001). */
export async function saveDealAction(_p: DealState, fd: FormData): Promise<DealState> {
  const { factoryId } = await requireFactory("products");
  const productId = str(fd, "productId");
  const tiers = Array.from({ length: MAX_TIERS }, (_, i) => ({
    minQty: str(fd, `minQty${i}`),
    factoryPrice: str(fd, `factoryPrice${i}`),
  }));
  const out = await run(async () => {
    await saveDealDraft(factoryId, productId, str(fd, "dealId") || null, {
      endsAt: str(fd, "endsAt"),
      maxQty: str(fd, "maxQty"),
      tiers,
    });
  }, "Deal saved");
  refresh(productId);
  return out;
}

export async function startDealAction(_p: DealState, fd: FormData): Promise<DealState> {
  const { factoryId } = await requireFactory("products");
  const out = await run(() => startDeal(factoryId, str(fd, "dealId")), "Deal is live");
  refresh(str(fd, "productId"));
  revalidatePath("/shop");
  return out;
}

export async function discardDealAction(_p: DealState, fd: FormData): Promise<DealState> {
  const { factoryId } = await requireFactory("products");
  const out = await run(() => discardDeal(factoryId, str(fd, "dealId")), "Draft discarded");
  refresh(str(fd, "productId"));
  return out;
}
