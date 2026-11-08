"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Hours } from "@/lib/agent-rules";
import { requireAgent } from "@/server/auth/session";
import { CartError } from "@/server/carts/errors";
import { flash } from "@/server/flash";
import { setHours } from "@/server/agents/hours";
import { requestLeave } from "@/server/agents/leave";
import { handOver, lookupCode, type PickupLine } from "@/server/orders/handover";
import { markBasketReceived } from "@/server/orders/delivery";
import { collectReturn } from "@/server/returns";
import { transferTokens } from "@/server/tokens";

export type AgentState = { error?: string; ok?: string; at?: number };
export type CodeState = AgentState & { code?: string; buyerName?: string; lines?: PickupLine[] };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function refresh() {
  for (const path of ["/agent", "/agent/pickups", "/agent/returns", "/agent/tokens"])
    revalidatePath(path);
}

/** Known refusals become an inline error; anything else falls to the error page. */
async function attempt(work: () => Promise<unknown>): Promise<AgentState | null> {
  try {
    await work();
    return null;
  } catch (error) {
    if (error instanceof CartError) return { error: error.message };
    throw error;
  }
}

export async function lookupCodeAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const user = await requireAgent();
  const code = text(fd, "code");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code", code };
  try {
    const found = await lookupCode(user.id, code);
    if (!found) return { error: "Code not found", code };
    return { code, buyerName: found.buyerName, lines: found.lines, at: Date.now() };
  } catch (error) {
    if (error instanceof CartError) return { error: error.message, code };
    throw error;
  }
}

export async function handOverAction(_prev: CodeState, fd: FormData): Promise<CodeState> {
  const user = await requireAgent();
  const code = text(fd, "code");
  const ids = fd.getAll("line").map(String);
  const failed = await attempt(() => handOver(user.id, code, ids));
  if (failed) return failed;
  refresh();
  return { ok: "Handed over", at: Date.now() };
}

export async function markReceivedAction(
  basketId: string,
  _prev: AgentState,
  fd: FormData,
): Promise<AgentState> {
  const user = await requireAgent();
  const failed = await attempt(() =>
    markBasketReceived(user.id, basketId, fd.getAll("return").map(String)),
  );
  if (failed) return failed;
  await flash("Basket received");
  refresh();
  return {};
}

export async function collectReturnAction(
  returnId: string,
  _prev: AgentState,
  _fd: FormData,
): Promise<AgentState> {
  const user = await requireAgent();
  const failed = await attempt(() => collectReturn(user.id, returnId));
  if (failed) return failed;
  await flash("Return collected");
  refresh();
  return {};
}

const toMinutes = (v: string) => {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export async function saveHoursAction(_prev: AgentState, fd: FormData): Promise<AgentState> {
  const user = await requireAgent();
  const hours: Hours = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    if (fd.get(`open-${weekday}`) !== "on") continue;
    // "24:00" is not a time input value; 23:59 closes at the end of the day.
    const closes = text(fd, `closes-${weekday}`);
    hours.push({
      weekday,
      opensAt: toMinutes(text(fd, `opens-${weekday}`)),
      closesAt: closes === "23:59" ? 24 * 60 : toMinutes(closes),
    });
  }
  const failed = await attempt(() => setHours(user.id, hours));
  if (failed) return failed;
  revalidatePath("/agent/hours");
  return { ok: "Hours saved", at: Date.now() };
}

export async function sendTokensAction(_prev: AgentState, fd: FormData): Promise<AgentState> {
  const user = await requireAgent();
  const failed = await attempt(() =>
    transferTokens(user.id, text(fd, "to"), text(fd, "amount"), text(fd, "requestKey")),
  );
  if (failed) return failed;
  await flash("Tokens sent");
  revalidatePath("/agent/tokens");
  redirect("/agent/tokens");
}

export async function leaveAction(_prev: AgentState, fd: FormData): Promise<AgentState> {
  const user = await requireAgent();
  if (fd.get("confirm") !== "yes") return { error: "Confirm to leave" };
  const failed = await attempt(() => requestLeave(user.id));
  if (failed) return failed;
  await flash("Leaving");
  refresh();
  redirect("/agent");
}
