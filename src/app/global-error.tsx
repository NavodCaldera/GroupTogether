"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui";
import "./globals.css";

// Replaces the root layout when it fails, so it brings its own document and styles.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <title>Something went wrong · GroupBasket</title>
        <main
          role="alert"
          className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
        >
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => retry()}>Try again</Button>
            <LinkButton href="/" variant="secondary">
              Go to home
            </LinkButton>
          </div>
        </main>
      </body>
    </html>
  );
}
