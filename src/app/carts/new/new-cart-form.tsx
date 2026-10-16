"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type ActionState, createCartAction } from "@/server/carts/actions";

export function VisibilityChoice() {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Who can find it?</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="visibility" value="PUBLIC" defaultChecked className="mt-1" />
        <span>
          <strong>Public.</strong> Shown on the open carts panel, so anyone can join.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="visibility" value="PRIVATE" className="mt-1" />
        <span>
          <strong>Private.</strong> Only people with your link or an invite.
        </span>
      </label>
    </fieldset>
  );
}

export function NewCartForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createCartAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Cart name (optional)" name="name" hint="e.g. Office sneaker run">
        <Input name="name" maxLength={60} />
      </Field>
      <VisibilityChoice />
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start cart"}
      </Button>
    </form>
  );
}
