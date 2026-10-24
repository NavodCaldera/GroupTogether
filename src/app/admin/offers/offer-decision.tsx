"use client";

import { useActionState, useRef } from "react";
import { Alert, Button } from "@/components/ui";
import { decideOfferAction } from "@/server/admin-actions";

/**
 * Accept or Decline a stock offer, side by side.
 * Decline asks once more in a small window.
 */
export function OfferDecision({ offerId, name }: { offerId: string; name: string }) {
  const [state, run, pending] = useActionState(decideOfferAction, {});
  const confirm = useRef<HTMLDialogElement>(null);

  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="offerId" value={offerId} />
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => confirm.current?.showModal()}
        >
          Decline
        </Button>
        <Button type="submit" name="decision" value="accept" disabled={pending}>
          {pending ? "Working…" : "Accept"}
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}

      <dialog
        ref={confirm}
        aria-labelledby="decline-title"
        className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper p-5 text-ink backdrop:bg-black/60"
        onClick={(e) => {
          // A tap on the dimmed backdrop closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <h2 id="decline-title" className="font-semibold">
          Decline this offer?
        </h2>
        <p className="mt-1 text-sm text-subtle">
          {name}. The seller is told, with your note if you wrote one.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={() => confirm.current?.close()}>
            Cancel
          </Button>
          <Button
            type="submit"
            name="decision"
            value="decline"
            variant="danger"
            disabled={pending}
            onClick={() => confirm.current?.close()}
          >
            Yes, decline
          </Button>
        </div>
      </dialog>
    </form>
  );
}
