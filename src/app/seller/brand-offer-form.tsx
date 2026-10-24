"use client";

import { type FormEvent, startTransition, useActionState } from "react";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { type SellerState, sendBrandOfferAction } from "@/server/seller-actions";

/**
 * A luxury brand publishes a discounted product (product owner, 2026-10-24): its name and details,
 * the actual price, the discount price a piece we buy at, the pieces and the link to it on the
 * brand's website. Submitted by hand so a refused send keeps what was typed.
 */
export function BrandOfferForm({ website }: { website: string | null }) {
  const [state, run, pending] = useActionState<SellerState, FormData>(sendBrandOfferAction, {});

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
      <Field label="Description" name="description">
        <Textarea name="description" rows={4} maxLength={2000} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Actual price (LKR)" name="actualPrice">
          <Input name="actualPrice" inputMode="decimal" placeholder="18500" required />
        </Field>
        <Field label="Discount price (LKR)" name="offerPrice">
          <Input name="offerPrice" inputMode="decimal" placeholder="9800" required />
        </Field>
      </div>
      <Field label="Pieces" name="pieces">
        <Input name="pieces" inputMode="numeric" placeholder="40" required />
      </Field>
      <Field label="Link on your website" name="productUrl">
        <Input
          name="productUrl"
          type="url"
          placeholder={website ? `${website.replace(/\/$/, "")}/…` : "https://"}
          required
        />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send for review"}
      </Button>
    </form>
  );
}
