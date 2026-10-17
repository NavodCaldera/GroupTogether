"use client";

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
      <div className="toast-in flex items-center gap-3 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg">
        {children}
        <button
          type="button"
          onClick={() => setShown(false)}
          aria-label="Dismiss"
          className="-mr-1 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
