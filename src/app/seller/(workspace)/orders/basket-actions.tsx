"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import {
  type BasketActionState,
  givenToDriverAction,
  markPackedAction,
  reportMissingAction,
} from "./actions";

type Action = (p: BasketActionState, fd: FormData) => Promise<BasketActionState>;

/** One tap moves the basket on; the button stays disabled while it runs, so it can't go twice. */
function BasketStep({
  basketId,
  action,
  label,
}: {
  basketId: string;
  action: Action;
  label: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="basketId" value={basketId} />
      <Button type="submit" disabled={pending} className="min-h-12 w-full">
        {label}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}

export const MarkPacked = ({ basketId }: { basketId: string }) => (
  <BasketStep basketId={basketId} action={markPackedAction} label="Mark packed" />
);

export const GivenToDriver = ({ basketId }: { basketId: string }) => (
  <BasketStep basketId={basketId} action={givenToDriverAction} label="Given to driver" />
);

/** Report missing for one line: how many pieces and a note. */
export function ReportMissing({
  lineId,
  max,
  label,
}: {
  lineId: string;
  max: number;
  label: string;
}) {
  const [state, run, pending] = useActionState(reportMissingAction, {});
  return (
    <details className="group">
      <summary className="inline-flex min-h-10 cursor-pointer list-none items-center text-sm font-bold text-accent underline underline-offset-2 [&::-webkit-details-marker]:hidden">
        <span>Report missing</span>
        <span className="sr-only">: {label}</span>
      </summary>
      <form action={run} className="mt-2 flex flex-col gap-3">
        <input type="hidden" name="lineId" value={lineId} />
        <Field label="Pieces missing" name={`qty-${lineId}`}>
          <Input
            id={`qty-${lineId}`}
            name="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            defaultValue={1}
            required
          />
        </Field>
        <Field label="Note" name={`note-${lineId}`}>
          <Input id={`note-${lineId}`} name="note" maxLength={500} required />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending} className="min-h-11">
          Send report
        </Button>
        {state.error && <Alert>{state.error}</Alert>}
      </form>
    </details>
  );
}
