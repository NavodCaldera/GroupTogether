"use client";

import { useActionState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import {
  type ActionState,
  acceptAction,
  inviteAction,
  uploadSlipAction,
} from "@/server/carts/actions";

export function InviteForm({ cartId }: { cartId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
      <label htmlFor="contact" className="text-sm font-bold">
        Invite someone who has an account
      </label>
      <div className="flex gap-2">
        <Input
          id="contact"
          name="contact"
          placeholder="Email or 07X XXX XXXX"
          className="min-w-0 flex-1"
          required
        />
        <input type="hidden" name="cartId" value={cartId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Invite"}
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Alert tone="good">{state.ok}</Alert>}
    </form>
  );
}

export function AcceptForm({
  cartId,
  defaults,
}: {
  cartId: string;
  defaults: { address: string | null; city: string | null; phone: string | null } | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="cartId" value={cartId} />
      <p className="text-sm font-bold">PickMe drop-off (to you)</p>
      <Field label="Address" name="deliveryAddress">
        <Input name="deliveryAddress" defaultValue={defaults?.address ?? ""} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City" name="deliveryCity">
          <Input name="deliveryCity" defaultValue={defaults?.city ?? ""} required />
        </Field>
        <Field label="Mobile for the driver" name="deliveryPhone">
          <Input name="deliveryPhone" type="tel" defaultValue={defaults?.phone ?? ""} required />
        </Field>
      </div>
      <p className="text-xs text-subtle">
        You pay the PickMe driver the delivery fee when the order arrives.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Locking the order…" : "Accept the order and pay"}
      </Button>
    </form>
  );
}

export function SlipForm({ cartId }: { cartId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadSlipAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="cartId" value={cartId} />
      <Field label="Bank slip (photo or PDF, up to 5 MB)" name="slip">
        <input
          id="slip"
          name="slip"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Upload slip"}
      </Button>
    </form>
  );
}
