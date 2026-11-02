"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LocationPicker, type LocationDefaults } from "@/components/location-picker";
import { Toast } from "@/components/toast";
import { Alert, Button, Field, Input } from "@/components/ui";
import {
  type ActionState,
  acceptAction,
  inviteAction,
  joinAction,
  rateFactoryAction,
  uploadSlipAction,
} from "@/server/carts/actions";

export function InviteForm({ cartId }: { cartId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(inviteAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 border-t border-line pt-3">
      <label htmlFor="contact" className="text-sm font-bold">
        Invite by email or phone
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
      {state.ok && <Toast key={state.at}>{state.ok}</Toast>}
    </form>
  );
}

export function JoinForm({
  cartId,
  defaults,
}: {
  cartId: string;
  defaults: LocationDefaults | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(joinAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="cartId" value={cartId} />
      <LocationPicker defaults={defaults} />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Joining…" : "Join this cart"}
      </Button>
    </form>
  );
}

export function AcceptForm({
  cartId,
  back,
  defaults,
}: {
  cartId: string;
  /** This cart's page, to come back to after changing the profile */
  back: string;
  defaults: { address: string | null; city: string | null; phone: string | null } | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="cartId" value={cartId} />
      <div className="flex items-start justify-between gap-3 text-sm">
        <p className="min-w-0">
          <span className="text-subtle">Deliver to </span>
          {defaults?.address ? `${defaults.address}, ${defaults.city}` : "—"}
          {defaults?.phone && <span className="text-subtle"> · {defaults.phone}</span>}
        </p>
        <Link href={`/account?next=${encodeURIComponent(back)}`} className="shrink-0 text-accent">
          Change
        </Link>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Locking…" : "Accept & pay"}
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

/** 1–5 stars for the factory that shipped a delivered order; one rating per member. */
export function RateFactoryForm({ cartId, factory }: { cartId: string; factory: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rateFactoryAction, {});
  if (state.ok) return <p className="text-sm">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="cartId" value={cartId} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Rate {factory}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="stars" value={n} required className="peer sr-only" />
              <span className="grid size-11 place-items-center rounded-lg border border-line text-lg peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2">
                {n}★
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Send rating"}
      </Button>
    </form>
  );
}
