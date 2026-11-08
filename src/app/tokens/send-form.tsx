"use client";

import { useActionState, useState } from "react";
import { Toast } from "@/components/toast";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type SendState, sendTokensAction } from "./actions";

const newKey = () => crypto.randomUUID();

/** A fresh request key after each successful send, so a retry of the same send is not doubled. */
export function SendTokensForm({ max }: { max: string }) {
  const [key, setKey] = useState(newKey);
  const [state, action, pending] = useActionState<SendState, FormData>(async (p, fd) => {
    const next = await sendTokensAction(p, fd);
    if (next.ok) setKey(newKey());
    return next;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-3" key={state.at}>
      <input type="hidden" name="requestKey" value={key} />
      <Field label="Phone or email" name="to">
        <Input name="to" autoComplete="off" required />
      </Field>
      <Field label="Amount" name="amount">
        <Input
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          max={max}
          required
        />
      </Field>
      <Button type="submit" disabled={pending}>
        Send
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Toast key={state.at}>{state.ok}</Toast>}
    </form>
  );
}
