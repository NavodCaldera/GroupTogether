"use client";

import { Button, LinkButton } from "@/components/ui";

// Never show error.message: client errors can carry user data. Server errors arrive generic.
export default function ErrorBoundary({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-12 text-center"
    >
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={() => retry()}>Try again</Button>
        <LinkButton href="/" variant="secondary">
          Go to home
        </LinkButton>
      </div>
    </div>
  );
}
