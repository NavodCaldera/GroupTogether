"use client";
import { useActionState } from "react";
import { joinBasketAction, startBasketAction, type BasketState } from "@/server/basket-actions";
import { Alert, Button } from "./ui";

function PayForm({
  act,
  fields,
  label,
}: {
  act: (p: BasketState, fd: FormData) => Promise<BasketState>;
  fields: Record<string, string>;
  label: string;
}) {
  const [state, action, pending] = useActionState(act, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {label}
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}

export function StartBasketForm({ versionId, path, price }: { versionId: string; path: string; price: string }) {
  return <PayForm act={startBasketAction} fields={{ versionId, path }} label={`Start a basket · pay ${price}`} />;
}

export function JoinBasketForm({ groupId, price }: { groupId: string; price: string }) {
  return <PayForm act={joinBasketAction} fields={{ groupId }} label={`Join · pay ${price}`} />;
}
