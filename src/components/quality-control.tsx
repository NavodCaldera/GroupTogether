"use client";
import { useActionState, useState } from "react";
import { Alert, Button, Input } from "./ui";
import {
  hideProductAction,
  removeFactoryAction,
  type QualityState,
} from "@/server/quality-actions";
export function QualityControl({
  kind,
  id,
  reason = "",
  finished = false,
  earningsHeld = false,
  note = "",
}: {
  kind: "product" | "factory";
  id: string;
  reason?: string;
  finished?: boolean;
  earningsHeld?: boolean;
  note?: string;
}) {
  const [state, action, pending] = useActionState<QualityState, FormData>(
    kind === "product" ? hideProductAction : removeFactoryAction,
    {},
  );
  const [confirm, setConfirm] = useState(false),
    [hold, setHold] = useState(earningsHeld);
  const label = kind === "product" ? "Hide reason" : "Removal reason";
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2 border-t border-line pt-3">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`${kind}-${id}-reason`}>{label}</label>
      <Input
        id={`${kind}-${id}-reason`}
        name="reason"
        required
        minLength={3}
        maxLength={2000}
        defaultValue={reason}
        readOnly={finished}
      />
      {kind === "factory" && (
        <>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="holdEarnings"
              checked={hold}
              onChange={(e) => setHold(e.target.checked)}
              disabled={finished && earningsHeld}
            />
            Hold earnings
          </label>
          {finished && earningsHeld && <input type="hidden" name="holdEarnings" value="on" />}
          {hold && (
            <>
              <label htmlFor={`hold-${id}`}>Earnings hold note</label>
              <Input
                id={`hold-${id}`}
                name="note"
                required
                maxLength={2000}
                defaultValue={note}
                readOnly={finished && earningsHeld}
              />
            </>
          )}
        </>
      )}
      {confirm ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} variant="danger">
            {finished ? "Yes, retry" : kind === "product" ? "Yes, hide" : "Yes, remove factory"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirm(true)}>
          {finished ? "Retry cleanup" : kind === "product" ? "Hide product" : "Remove factory"}
        </Button>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && (
        <p role="status" className="text-sm text-accent">
          {state.ok}
        </p>
      )}
    </form>
  );
}
