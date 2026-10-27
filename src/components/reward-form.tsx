"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button } from "./ui";

export function RewardForm({
  action,
  submit,
  children,
  secondary = false,
}: {
  action: (state: { error?: string }, fd: FormData) => Promise<{ error?: string }>;
  submit: string;
  children?: ReactNode;
  secondary?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="flex min-w-0 flex-col gap-3">
      {children}
      <Button disabled={pending} variant={secondary ? "secondary" : "primary"}>
        {pending ? "Saving…" : submit}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
