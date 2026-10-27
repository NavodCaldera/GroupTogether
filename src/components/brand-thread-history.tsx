"use client";
import { startTransition, useEffect, useLayoutEffect, useRef } from "react";
import { readBrandThreadAction } from "@/server/brand-communication-actions";
export function BrandThreadHistory({
  thread,
  through,
  children,
}: {
  thread?: string;
  through?: string;
  children: React.ReactNode;
}) {
  const list = useRef<HTMLOListElement>(null),
    end = useRef<HTMLLIElement>(null),
    follow = useRef(true);
  useLayoutEffect(() => {
    if (list.current && follow.current) list.current.scrollTop = list.current.scrollHeight;
  }, [through]);
  useEffect(() => {
    const target = end.current;
    if (!target || !thread || !through) return;
    let visible = false;
    const read = () => {
      if (visible && document.visibilityState === "visible")
        startTransition(async () => {
          await readBrandThreadAction(thread, through);
        });
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      read();
    });
    observer.observe(target);
    document.addEventListener("visibilitychange", read);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", read);
    };
  }, [thread, through]);
  return (
    <ol
      ref={list}
      onScroll={() => {
        const el = list.current;
        if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      }}
      className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto rounded-lg bg-muted/40 p-2"
      aria-label="Conversation history"
    >
      {children}
      <li ref={end} aria-hidden="true" className="h-px shrink-0" />
    </ol>
  );
}
