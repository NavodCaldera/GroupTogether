import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  inbox,
  listMessages,
  sendMessage,
  threadsFor,
  unreadMessageCount,
} from "@/server/carts/chat";
import { createCart } from "@/server/carts/service";
import { db } from "@/server/db";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("messages: a buyer writes, the owner replies", () => {
  it("shows up unread in the owner's inbox, reads on open, and the reply reaches the buyer", async () => {
    const [owner, buyer] = [await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});

    await sendMessage(buyer.id, cart.id, "hi");
    expect(await unreadMessageCount(owner.id)).toBe(1);
    expect(await unreadMessageCount(buyer.id)).toBe(0);
    const [thread] = await inbox(owner.id);
    expect(thread).toMatchObject({
      cartId: cart.id,
      participantId: buyer.id,
      asOwner: true,
      lastBody: "hi",
      unread: 1,
    });
    expect((await threadsFor(cart.id))[0].unread).toBe(1);
    // The notice opens the conversation in the inbox.
    const notice = await db.notification.findFirstOrThrow({ where: { userId: owner.id } });
    expect(notice.href).toBe(`/messages?c=${cart.id}&with=${buyer.id}`);

    // The owner opens it: read, and the notice is cleared.
    await listMessages(owner.id, cart.id, buyer.id);
    expect(await unreadMessageCount(owner.id)).toBe(0);
    expect((await threadsFor(cart.id))[0].unread).toBe(0);
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt,
    ).not.toBeNull();

    // The owner replies; the buyer sees it in their own inbox.
    await sendMessage(owner.id, cart.id, "hello, welcome", buyer.id);
    expect(await unreadMessageCount(buyer.id)).toBe(1);
    const [mine] = await inbox(buyer.id);
    expect(mine).toMatchObject({ asOwner: false, lastBody: "hello, welcome", unread: 1 });
    expect((await inbox(owner.id))[0]).toMatchObject({ lastFromMe: true, unread: 0 });
  });

  it("marks a message seen only once the other side opens the conversation", async () => {
    const [owner, buyer] = [await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});
    await sendMessage(buyer.id, cart.id, "hi");
    // The sender's own view doesn't mark it seen.
    expect((await listMessages(buyer.id, cart.id)).map((m) => m.seen)).toEqual([false]);
    await listMessages(owner.id, cart.id, buyer.id);
    expect((await listMessages(buyer.id, cart.id)).map((m) => m.seen)).toEqual([true]);
  });

  it("keeps each buyer's conversation with the owner separate", async () => {
    const [owner, a, b] = [await makeUser(), await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});
    await sendMessage(a.id, cart.id, "from a");
    await sendMessage(b.id, cart.id, "from b");
    expect(await inbox(owner.id)).toHaveLength(2);
    expect((await listMessages(a.id, cart.id)).map((m) => m.body)).toEqual(["from a"]);
    await expect(sendMessage(owner.id, cart.id, "?", owner.id)).rejects.toThrow();
  });
});
