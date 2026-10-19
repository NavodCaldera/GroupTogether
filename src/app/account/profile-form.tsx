"use client";

import { useActionState } from "react";
import { LocationPicker, type LocationDefaults } from "@/components/location-picker";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type FormState, saveProfileAction } from "@/server/auth/actions";

export function ProfileForm({
  next,
  defaults,
  phoneHint = "The PickMe driver calls this number",
  addressLabel,
  addressHint,
}: {
  next?: string;
  defaults: LocationDefaults & { name: string; phone: string | null };
  phoneHint?: string;
  addressLabel?: string;
  addressHint?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Name" name="name" error={e.name}>
        <Input name="name" autoComplete="name" defaultValue={defaults.name} required />
      </Field>
      <Field label="Mobile" name="phone" error={e.phone} hint={phoneHint}>
        <Input
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="0771234567"
          defaultValue={defaults.phone ?? ""}
          required
        />
      </Field>
      <LocationPicker
        defaults={defaults}
        errors={e}
        addressLabel={addressLabel}
        addressHint={addressHint}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
