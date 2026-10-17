"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { sendMessageAction } from "@/server/carts/actions";

type Msg = { id: string; authorId: string; body: string; createdAt: string; seen: boolean };

/** WhatsApp-style ticks on my own messages: one grey tick sent, two green ticks seen. */
function Ticks({ seen }: { seen: boolean }) {
  return (
    <svg
      viewBox="0 0 18 12"
      className={`inline-block h-3 w-[18px] align-[-1px] ${seen ? "text-accent" : "text-subtle"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={seen ? "Seen" : "Sent"}
    >
      <path d="M1 6.5 4.5 10 11 2" />
      {seen && <path d="M8.5 9.5 9 10l6.5-8" />}
    </svg>
  );
}

/** One conversation with the cart owner. Polls every 8 s while the tab is visible. */
export function ChatPanel({
  cartId,
  withId,
  meId,
  initial,
  otherName,
}: {
  cartId: string;
  withId?: string;
  meId: string;
  initial: Msg[];
  otherName: string;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const end = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const q = new URLSearchParams({ cartId, ...(withId ? { with: withId } : {}) });
      const res = await fetch(`/api/chat?${q}`, { cache: "no-store" });
      if (res.ok) setMessages(await res.json());
    } catch {}
  }

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartId, withId]);

  function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    start(async () => {
      const r = await sendMessageAction({}, fd);
      setError(r.error);
      if (!r.error) f.reset();
      await refresh();
    });
  }

  useEffect(() => {
    const box = end.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-live="polite"
        className="flex max-h-72 min-h-24 flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-muted/40 p-3"
      >
        {messages.length === 0 && (
          <p className="text-sm text-subtle">No messages yet. Say hello to {otherName}.</p>
        )}
        {messages.map((m) => {
          const mine = m.authorId === meId;
          return (
            <div key={m.id} className={mine ? "self-end text-right" : "self-start"}>
              <p
                className={`inline-block max-w-[16rem] rounded-2xl px-3 py-2 text-left text-sm break-words ${mine ? "bg-accent text-on-accent" : "bg-paper border border-line"}`}
              >
                {m.body}
              </p>
              <p className="mt-0.5 text-[11px] text-subtle">
                {new Date(m.createdAt).toLocaleTimeString("en-LK", { hour: "numeric", minute: "2-digit" })}
                {mine && (
                  <>
                    {" "}
                    <Ticks seen={m.seen} />
                  </>
                )}
              </p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error && <Alert>{error}</Alert>}
      <form ref={form} onSubmit={send} className="flex gap-2">
        <input type="hidden" name="cartId" value={cartId} />
        {withId && <input type="hidden" name="with" value={withId} />}
        <Input
          name="body"
          placeholder="Write a message"
          maxLength={500}
          autoComplete="off"
          className="min-w-0 flex-1"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
