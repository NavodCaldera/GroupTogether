"use client";

import { type FormEvent, startTransition, useActionState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { type SellerState, sendOfferAction } from "@/server/seller-actions";

/**
 * The factory seller's only form (product owner, 2026-10-19): product name, details about the
 * stock, the total selling price, then "Send for review". Submitted by hand so a refused send
 * keeps what was typed.
 */
export function OfferForm() {
  const [state, run, pending] = useActionState<SellerState, FormData>(sendOfferAction, {});

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => run(fd));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Product name" name="name">
        <Input name="name" maxLength={120} required />
      </Field>
      <Field label="Description" name="description" hint="Details about the stock">
        <Textarea name="description" rows={5} maxLength={2000} required />
      </Field>
      <Field label="Amount (LKR)" name="amount" hint="Total selling price for all of it">
        <Input name="amount" inputMode="decimal" placeholder="250000" required />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send for review"}
      </Button>
    </form>
  );
}
