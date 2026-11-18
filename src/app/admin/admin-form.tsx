"use client";

import { type ReactNode, useActionState, useEffect, useRef } from "react";
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
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef<[string, string][]>([]);
  // React resets a form after its action runs. On an error, put back what the admin typed so
  // one wrong field does not cost them the whole form.
  useEffect(() => {
    if (!state.error || !form.current) return;
    for (const [name, value] of sent.current) {
      const field = form.current.elements.namedItem(name);
      if (
        (field instanceof HTMLInputElement &&
          !["hidden", "file", "checkbox", "radio"].includes(field.type)) ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )
        field.value = value;
    }
  }, [state]);
  return (
    <form
      ref={form}
      action={run}
      onSubmit={(e) => {
        sent.current = [...new FormData(e.currentTarget)].flatMap(([k, v]) =>
          typeof v === "string" ? [[k, v] as [string, string]] : [],
        );
      }}
      className={className}
    >
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Working…" : submit}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
