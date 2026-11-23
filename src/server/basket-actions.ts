"use server";

import { redirect } from "next/navigation";
import { requireUser } from "./auth/session";
import { AppError } from "./errors";
import { joinBasket, startBasket } from "./packs-join";

export type BasketState = { error?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function pay(work: () => Promise<{ redirectUrl: string }>): Promise<BasketState> {
  let url: string;
  try {
    url = (await work()).redirectUrl;
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
  redirect(url);
}

export async function startBasketAction(_p: BasketState, fd: FormData): Promise<BasketState> {
  const user = await requireUser(str(fd, "path") || "/");
  return pay(() => startBasket(user.id, str(fd, "versionId")));
}

export async function joinBasketAction(_p: BasketState, fd: FormData): Promise<BasketState> {
  const id = str(fd, "groupId");
  const user = await requireUser(`/baskets/${id}`);
  return pay(() => joinBasket(user.id, id));
}
