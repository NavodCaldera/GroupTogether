"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

/**
 * A short pop-up at the bottom of the screen that hides itself. Give it a new `key` for each
 * message so it shows again. Sits above the phone tab bar.
 */
export function Toast({ children, ms = 3500 }: { children: ReactNode; ms?: number }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShown(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  if (!shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
    >
      <div className="toast-in flex w-full max-w-md items-center justify-between gap-3 rounded-lg border border-accent bg-[color-mix(in_srgb,var(--accent)_10%,var(--paper))] px-4 py-3 text-sm font-medium text-ink shadow-lg">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
        <button
          type="button"
          onClick={() => setShown(false)}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Reads and clears the one-time `flash` cookie that `flash()` sets in a server action. */
function takeFlash() {
  const m = document.cookie.match(/(?:^|;\s*)flash=([^;]*)/);
  if (!m) return null;
  document.cookie = "flash=; Max-Age=0; path=/";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * The site-wide success pop-up (root layout). It checks for a flash message on every page and,
 * after a form is sent, until the action's reply arrives (which also covers actions that stay
 * on the same page).
 */
export function FlashToast() {
  const pathname = usePathname();
  const [msg, setMsg] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const text = takeFlash();
      if (text) setMsg({ text, at: Date.now() });
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const onSubmit = () => {
      clearInterval(timer);
      const until = Date.now() + 60_000;
      timer = setInterval(() => {
        const text = takeFlash();
        if (text) setMsg({ text, at: Date.now() });
        if (text || Date.now() > until) clearInterval(timer);
      }, 200);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      clearInterval(timer);
    };
  }, []);

  return msg ? <Toast key={msg.at}>{msg.text}</Toast> : null;
}
