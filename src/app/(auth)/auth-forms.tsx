"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type FormState, signInAction, signUpAction } from "@/server/auth/actions";

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Email" name="email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" name="password">
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Full name" name="name" error={e.name}>
        <Input name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" name="email" error={e.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label="Mobile number"
        name="phone"
        error={e.phone}
        hint="Friends can invite you with this number"
      >
        <Input name="phone" type="tel" autoComplete="tel" placeholder="0771234567" required />
      </Field>
      <Field
        label="Delivery address"
        name="address"
        error={e.address}
        hint="Used when you start a cart"
      >
        <Input name="address" autoComplete="street-address" required />
      </Field>
      <Field label="City" name="city" error={e.city}>
        <Input name="city" autoComplete="address-level2" placeholder="Colombo" required />
      </Field>
      <Field label="Password" name="password" error={e.password}>
        <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
