"use client";

import { useActionState, useState } from "react";
import { SuggestInput } from "@/components/suggest-input";
import { Toast } from "@/components/toast";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type SendState, sendTokensAction } from "./actions";

const newKey = () => crypto.randomUUID();

/** A fresh request key after each successful send, so a retry of the same send is not doubled. */
export function SendTokensForm({ max }: { max: string }) {
  const [key, setKey] = useState(newKey);
  const [amount, setAmount] = useState("");
  const [state, action, pending] = useActionState<SendState, FormData>(async (p, fd) => {
    const next = await sendTokensAction(p, fd);
    if (next.ok) {
      setKey(newKey());
      setAmount("");
    }
    return next;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-3" key={state.at}>
      <input type="hidden" name="requestKey" value={key} />
      <div className="grid gap-3 sm:grid-cols-[3fr_2fr]">
        <Field label="Phone or email" name="to">
          <SuggestInput
            endpoint="/api/token-recipients"
            name="to"
            label="Phone or email"
            fill
            required
          />
        </Field>
        <Field label="Amount" name="amount">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-subtle">
              LKR
            </span>
            <Input
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={max}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full pr-16 pl-12 tabular-nums"
            />
            <button
              type="button"
              onClick={() => setAmount(max)}
              className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-medium text-accent hover:bg-muted"
            >
              Max
            </button>
          </div>
        </Field>
      </div>
      <Button type="submit" disabled={pending} className="sm:self-end sm:px-8">
        {pending ? "Sending…" : "Send"}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Toast key={state.at}>{state.ok}</Toast>}
    </form>
  );
}
