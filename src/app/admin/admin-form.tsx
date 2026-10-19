"use client";

import { type ReactNode, useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import type { AdminState } from "@/server/admin-actions";

/** One admin form: posts to a server action and shows its error (success pops up via flash). */
export function AdminForm({
  action,
  submit,
  children,
  variant = "primary",
  className = "flex flex-col gap-3",
}: {
  action: (prev: AdminState, fd: FormData) => Promise<AdminState>;
  submit: string;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className={className}>
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Working…" : submit}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
