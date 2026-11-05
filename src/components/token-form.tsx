"use client";
import { useActionState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { Toast } from "@/components/toast";
import { applyTokensAction, type ActionState } from "@/server/carts/actions";
export function TokenForm({
  lineId,
  requestKey,
  maximum,
}: {
  lineId: string;
  requestKey: string;
  maximum: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyTokensAction, {});
  return (
    <form action={action} className="flex basis-full flex-col gap-2 pt-2">
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <label htmlFor={`tokens-${lineId}`} className="font-medium">
        Tokens (LKR)
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`tokens-${lineId}`}
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          max={maximum}
          required
          className="min-w-0 flex-1"
        />
        <Button disabled={pending} variant="secondary">
          Apply tokens
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Toast key={state.at}>{state.ok}</Toast>}
    </form>
  );
}
