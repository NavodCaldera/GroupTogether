import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { inbox, listMessages, newThreadWith } from "@/server/carts/chat";
import { ChatPanel } from "../c/[code]/chat";

export const metadata: Metadata = { title: "Messages" };

/**
 * Every conversation in one place: cart owners reply to the people who wrote about their cart,
 * buyers follow up with owners. On phones the list and the open conversation take turns.
 */
export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const user = await requireUser([], "/messages");
  if (user.role === "SELLER") redirect("/seller");
  const sp = await searchParams;
  const c = typeof sp.c === "string" ? sp.c : undefined;
  const w = typeof sp.with === "string" ? sp.with : undefined;

  // Open (and so read) the chosen conversation first, so the list shows it as read.
  let opened: Awaited<ReturnType<typeof listMessages>> | null = null;
  if (c && w) {
    try {
      opened = await listMessages(user.id, c, w === user.id ? undefined : w);
    } catch {
      opened = null;
    }
  }
  const threads = await inbox(user.id);
  // No messages yet: the owner starting a chat with someone asking to join their cart.
  const open =
    opened && c && w
      ? (threads.find((t) => t.cartId === c && t.participantId === w) ??
        (await newThreadWith(user.id, c, w)) ??
        undefined)
      : undefined;

  return (
    <>
      <PageHeader title="Messages" />
      {threads.length === 0 && !open ? (
        <EmptyState title="No messages yet">
          When someone writes about your cart, or you message a cart owner, it shows up here.
        </EmptyState>
      ) : (
        <div className={`grid gap-4 ${threads.length > 0 ? "lg:grid-cols-[320px_1fr]" : ""}`}>
          {threads.length > 0 && (
            <ul
              className={`divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper ${open ? "hidden lg:block" : ""}`}
            >
              {threads.map((t) => {
                const active = t.cartId === open?.cartId && t.participantId === open?.participantId;
                return (
                  <li key={`${t.cartId}:${t.participantId}`}>
                    <Link
                      href={`/messages?c=${t.cartId}&with=${t.participantId}`}
                      className={`flex gap-3 p-3 hover:bg-muted ${active ? "bg-muted" : ""}`}
                    >
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent"
                      >
                        {t.otherName.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className={`truncate ${t.unread ? "font-bold" : "font-medium"}`}>
                          {t.otherName}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[11px] text-subtle">
                            {formatDateTime(t.lastAt)}
                          </span>
                          {t.unread > 0 && (
                            <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-on-accent">
                              {t.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {open && opened ? (
            <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4">
              <div className="min-w-0">
                <Link href="/messages" className="text-sm text-subtle hover:text-ink lg:hidden">
                  ← All messages
                </Link>
                <h2 className="truncate font-semibold">{open.otherName}</h2>
              </div>
              <ChatPanel
                key={`${open.cartId}:${open.participantId}`}
                cartId={open.cartId}
                withId={open.asOwner ? open.participantId : undefined}
                meId={user.id}
                initial={opened.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
                otherName={open.otherName}
              />
            </section>
          ) : (
            <p className="hidden items-center justify-center rounded-xl border border-dashed border-line p-8 text-sm text-subtle lg:flex">
              Choose a conversation to read and reply.
            </p>
          )}
        </div>
      )}
    </>
  );
}
