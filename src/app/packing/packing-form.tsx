"use client";

import { type ReactNode, useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import type { PackingState } from "@/server/packing-actions";

/** One packing step: a button for one cart. Errors show here; on success the page moves on. */
export function PackingForm({
  action,
  cartId,
  code,
  submit,
  variant = "primary",
  children,
}: {
  action: (prev: PackingState, fd: FormData) => Promise<PackingState>;
  cartId: string;
  code: string;
  submit: string;
  variant?: "primary" | "secondary" | "danger";
  children?: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="flex flex-col gap-2">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="code" value={code} />
      {children}
      <Button type="submit" variant={variant} disabled={pending} className="w-full">
        {pending ? "Saving…" : submit}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
