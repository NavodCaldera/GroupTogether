"use client";

import { useActionState, type ReactNode } from "react";
import { AboutYouFields } from "@/components/about-you-fields";
import { LocationPicker, type LocationDefaults } from "@/components/location-picker";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { type FormState, saveProfileAction } from "@/server/auth/actions";

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `profile-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-sm font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h2>
      <Card className="flex flex-col gap-4">{children}</Card>
    </section>
  );
}

export function ProfileForm({
  next,
  defaults,
  phoneHint,
  addressLabel,
  addressHint,
  aboutYou = false,
}: {
  next?: string;
  defaults: LocationDefaults & {
    name: string;
    phone: string | null;
    gender?: string | null;
    birthDate?: Date | null;
  };
  /** Buyers: gender and date of birth, which pick the shop's audience. */
  aboutYou?: boolean;
  phoneHint?: string;
  addressLabel?: string;
  addressHint?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Section title="Details">
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
        {aboutYou && <AboutYouFields errors={e} defaults={defaults} />}
      </Section>
      <Section title="Address">
        <LocationPicker
          defaults={defaults}
          errors={e}
          addressLabel={addressLabel}
          addressHint={addressHint}
        />
      </Section>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto sm:self-end sm:px-10">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
