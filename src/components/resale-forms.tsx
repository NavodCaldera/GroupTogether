"use client";
import { type ReactNode, useActionState } from "react";
import type { ResaleState } from "@/server/resale-actions";
import { Alert, Button } from "./ui";

/** A resale form: hidden fields, any inputs as children, one submit button and its error. */
export function ActionForm({
  act,
  fields,
  label,
  variant,
  className,
  children,
}: {
  act: (p: ResaleState, fd: FormData) => Promise<ResaleState>;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(act, {});
  return (
    <form action={action} className={className ?? "flex flex-col gap-3"}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" variant={variant} disabled={pending} className="self-start">
        {label}
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}
