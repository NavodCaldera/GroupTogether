"use client";
import { type ReactNode, useActionState } from "react";
import { Alert, Button, Field, Input } from "./ui";
import type { PartnerState } from "@/server/partner-actions";
export function PartnerForm({
  action,
  submit,
  children,
}: {
  action: (prev: PartnerState, fd: FormData) => Promise<PartnerState>;
  submit: string;
  children: ReactNode;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="flex min-w-0 flex-col gap-4">
      {state.ok ? (
        <Alert tone="good">Application submitted</Alert>
      ) : (
        <>
          {children}
          <Button disabled={pending}>{pending ? "Working..." : submit}</Button>
        </>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {state.activationUrl && (
        <Field name="signInLink" label="Sign-in link">
          <Input
            name="signInLink"
            readOnly
            value={new URL(state.activationUrl, window.location.origin).href}
            className="w-full min-w-0"
          />
        </Field>
      )}
      {state.inviteUrl && (
        <a className="break-all underline" href={state.inviteUrl}>
          Open invite
        </a>
      )}
    </form>
  );
}
