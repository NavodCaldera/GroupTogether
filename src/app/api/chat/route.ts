import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { listMessages } from "@/server/carts/chat";
import { CartError } from "@/server/carts/service";

/** Polled by the chat island every few seconds while the tab is visible. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  try {
    const messages = await listMessages(user.id, q.get("cartId") ?? "", q.get("with"));
    return NextResponse.json(messages, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof CartError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
