"use client";
import { useActionState, useState } from "react";
import { Alert, Button } from "./ui";
import {
  markDoneAction,
  undoDoneAction,
  removeMemberAction,
  type ActionState,
} from "@/server/carts/actions";
export function MemberDoneControl({ cartId, done }: { cartId: string; done: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    done ? undoDoneAction : markDoneAction,
    {},
  );
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="cartId" value={cartId} />
      <Button disabled={pending} variant="secondary">
        {done ? "Undo" : "Done"}
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
export function RemoveMemberControl({ cartId, memberId }: { cartId: string; memberId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(removeMemberAction, {});
  return (
    <form action={action} className="flex basis-full flex-col gap-2">
      <input type="hidden" name="cartId" value={cartId} />
      <input type="hidden" name="memberId" value={memberId} />
      {confirm ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} variant="danger">
            Yes, remove
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirm(true)}>
          Remove
        </Button>
      )}
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
