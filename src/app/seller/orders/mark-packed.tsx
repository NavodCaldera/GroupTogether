"use client";

import { useActionState, useOptimistic } from "react";
import { Alert, Button } from "@/components/ui";
import { markFactoryPackedAction } from "@/server/factory-order-actions";

/**
 * "Mark packed" (product owner, 2026-11-03): shows Packed at once and can't be tapped twice; the
 * server also ignores a second mark, so a double tap changes the order only once.
 */
export function MarkPacked({ cartId }: { cartId: string }) {
  const [state, run, pending] = useActionState(markFactoryPackedAction, {});
  const [packed, setPacked] = useOptimistic(false, () => true);
  const done = (packed || pending) && !state.error;
  return (
    <form
      action={(fd) => {
        setPacked(true);
        run(fd);
      }}
      className="mt-3 flex flex-col gap-2"
    >
      <input type="hidden" name="cartId" value={cartId} />
      <Button type="submit" disabled={done} className="min-h-12 w-full">
        {done ? "Packed ✓" : "Mark packed"}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
