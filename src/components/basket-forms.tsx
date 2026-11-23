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

/** One button per basket size; the pressed button's `size` is sent with the form. */
export function StartBasketForm({
  versionId,
  path,
  sizes,
}: {
  versionId: string;
  path: string;
  sizes: { size: number; price: string }[];
}) {
  const [state, action, pending] = useActionState(startBasketAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="path" value={path} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {sizes.map((s) => (
          <Button key={s.size} type="submit" name="size" value={s.size} disabled={pending}>
            Start {s.size}-family basket · pay {s.price}
          </Button>
        ))}
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}

export function JoinBasketForm({ groupId, price }: { groupId: string; price: string }) {
  return <PayForm act={joinBasketAction} fields={{ groupId }} label={`Join · pay ${price}`} />;
}
