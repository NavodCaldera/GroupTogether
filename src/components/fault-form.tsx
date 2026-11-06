"use client";
import { useActionState, useId } from "react";
import { faultAction } from "@/server/fault-actions";
import { Alert, Button, Textarea } from "./ui";
export function FaultForm({ id, op }: { id: string; op: "message" | "decide" | "cancel" }) {
  const [state, action, pending] = useActionState(faultAction, {}),
    uid = useId();
  const label =
    op === "message" ? "Hold message" : op === "decide" ? "Decision note" : "Cancellation note";
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <label htmlFor={uid}>{label}</label>
      <Textarea
        id={uid}
        name={op === "message" ? "body" : "note"}
        required
        maxLength={op === "message" ? 1000 : 2000}
      />
      <div className="flex flex-wrap gap-2">
        {op === "decide" ? (
          <>
            <Button name="decision" value="CONTINUE" disabled={pending}>
              Continue
            </Button>
            <Button name="decision" value="REMOVE" variant="danger" disabled={pending}>
              Remove
            </Button>
          </>
        ) : (
          <Button disabled={pending}>
            {op === "message" ? "Send hold message" : "Cancel fault"}
          </Button>
        )}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
