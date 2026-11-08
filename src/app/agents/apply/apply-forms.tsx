"use client";
import { useActionState } from "react";
import { LocationPicker, type LocationDefaults } from "@/components/location-picker";
import { Alert, Button, Field, Input } from "@/components/ui";
import { type ApplyState, applyAction, payDepositAction } from "./actions";

const IMAGES = "image/jpeg,image/png,image/webp";

export function ApplyForm({ defaults }: { defaults: LocationDefaults }) {
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="NIC photo" name="nic">
        <Input className="w-full min-w-0 py-2" name="nic" type="file" accept={IMAGES} required />
      </Field>
      <Field label="Your photo" name="photo">
        <Input className="w-full min-w-0 py-2" name="photo" type="file" accept={IMAGES} required />
      </Field>
      <Field label="Storage photos" name="storagePhotos">
        <Input
          className="w-full min-w-0 py-2"
          name="storagePhotos"
          type="file"
          accept={IMAGES}
          multiple
          required
        />
      </Field>
      <LocationPicker defaults={defaults} addressLabel="Address" />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  );
}

export function PayDepositForm() {
  const [state, action, pending] = useActionState<ApplyState, FormData>(payDepositAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        Pay deposit
      </Button>
    </form>
  );
}
