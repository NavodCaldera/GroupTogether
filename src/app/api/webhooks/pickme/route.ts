import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { setDeliveryStatus } from "@/server/delivery";

/**
 * PickMe delivery status callbacks, signed with HMAC-SHA256 of the raw body (hex, x-signature).
 * ASSUMED payload { reference | id, status }: map to PickMe's documented fields once available.
 */
const STATUS: Record<string, DeliveryStatus> = {
  picked_up: "PICKED_UP",
  delivered: "DELIVERED",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

export async function POST(req: Request) {
  const secret = process.env.PICKME_WEBHOOK_SECRET;
  const body = await req.text();
  const sig = req.headers.get("x-signature") ?? "";
  const expected = secret ? createHmac("sha256", secret).update(body).digest("hex") : "";
  if (
    !secret ||
    secret === "CHANGE_ME" ||
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });

  let event: { id?: string; reference?: string; status?: string };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const status = STATUS[String(event.status ?? "").toLowerCase()];
  if (!status) return Response.json({ ignored: true });
  const delivery = await db.delivery.findFirst({
    where: {
      OR: [
        { externalRef: event.id ?? "__none__" },
        { cart: { code: event.reference ?? "__none__" } },
      ],
    },
  });
  if (!delivery) return new Response("Unknown delivery", { status: 404 });
  await setDeliveryStatus(delivery.id, status);
  return Response.json({ ok: true });
}
