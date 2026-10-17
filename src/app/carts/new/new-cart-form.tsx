"use client";

import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import { type ActionState, createCartAction } from "@/server/carts/actions";

export function VisibilityChoice() {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">Who can find it?</legend>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm has-checked:border-accent sm:gap-2 sm:border-0 sm:p-0">
        <input
          type="radio"
          name="visibility"
          value="PUBLIC"
          defaultChecked
          className="mt-0.5 size-5 accent-accent sm:mt-1 sm:size-auto"
        />
        <span>
          <strong>Public.</strong> Shown on the open carts panel, so anyone can join.
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 text-sm has-checked:border-accent sm:gap-2 sm:border-0 sm:p-0">
        <input
          type="radio"
          name="visibility"
          value="PRIVATE"
          className="mt-0.5 size-5 accent-accent sm:mt-1 sm:size-auto"
        />
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
      <VisibilityChoice />
      <Button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start cart"}
      </Button>
    </form>
  );
}
