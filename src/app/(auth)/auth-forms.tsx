"use client";

import { useActionState, useRef } from "react";
import { LocationPicker } from "@/components/location-picker";
import { PasswordInput } from "@/components/password-input";
import { Alert, Button, Field, Input } from "@/components/ui";
import { DEMO_PASSWORD, type DemoAccount } from "@/lib/demo-accounts";
import { type FormState, signInAction, signUpAction } from "@/server/auth/actions";

export function SignInForm({ next, demo = [] }: { next?: string; demo?: DemoAccount[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const form = useRef<HTMLFormElement>(null);
  /** Fills the form with a demo account; the user still presses Sign in. */
  const use = (email: string) => {
    const f = form.current;
    if (!f) return;
    (f.elements.namedItem("email") as HTMLInputElement).value = email;
    (f.elements.namedItem("password") as HTMLInputElement).value = DEMO_PASSWORD;
  };
  return (
    <form ref={form} action={action} className="flex flex-col gap-4">
      {demo.length > 0 && (
        <div className="rounded-lg border border-dashed border-line bg-muted/50 p-3 text-sm">
          <p className="font-bold">Demo accounts</p>
          <p className="mb-2 text-xs text-subtle">
            Password for all: <code className="font-mono text-ink">{DEMO_PASSWORD}</code>
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {demo.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {a.role} <span className="font-normal text-subtle">· {a.name}</span>
                  </p>
                  <p className="truncate font-mono text-xs">{a.email}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 px-3 text-xs sm:min-h-8"
                  onClick={() => use(a.email)}
                  aria-label={`Use the demo account ${a.email}`}
                >
                  Use
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
      <LocationPicker errors={e} addressHint="Used when you join or start a cart" />
      <Field label="Password" name="password" error={e.password}>
        <PasswordInput name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
