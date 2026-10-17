import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { listMessages, sendMessage, threadsFor } from "@/server/carts/chat";
import { createCart } from "@/server/carts/service";
import { db } from "@/server/db";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("cart chat with the owner", () => {
  it("keeps each person's thread private and notifies once per conversation", async () => {
    const [owner, a, b] = [await makeUser(), await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});
    await sendMessage(a.id, cart.id, "Is this still open?");
    await sendMessage(a.id, cart.id, "Hello?");
    expect(await db.notification.count({ where: { userId: owner.id } })).toBe(1);

    await sendMessage(owner.id, cart.id, "Yes, join in", a.id);
    expect((await listMessages(a.id, cart.id)).map((m) => m.body)).toEqual([
      "Is this still open?",
      "Hello?",
      "Yes, join in",
    ]);
    expect(await listMessages(b.id, cart.id)).toHaveLength(0);
    expect(await threadsFor(cart.id)).toMatchObject([{ participantId: a.id, count: 3 }]);
  });

  it("stops the owner starting a thread, and empty or long messages", async () => {
    const [owner, a] = [await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});
    await expect(sendMessage(owner.id, cart.id, "hi", a.id)).rejects.toThrow(/hasn't written/);
    await expect(sendMessage(a.id, cart.id, "   ")).rejects.toThrow();
    await expect(sendMessage(a.id, cart.id, "x".repeat(501))).rejects.toThrow();
  });
});
