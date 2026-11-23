"use client";

import { useActionState, useState } from "react";
import { type CompanyState, imageAction, packAction } from "@/server/company-actions";
import { Alert, Button, Input } from "./ui";

export function ImageForm({ target, label }: { target: string; label: string }) {
  const [state, action, pending] = useActionState(imageAction, {} as CompanyState);
  const id = `file-${target}`;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="target" value={target} />
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          name="file"
          type="file"
          required
          accept="image/png,image/jpeg,image/webp"
          className="min-w-0 max-w-full text-sm file:mr-2 file:rounded-md file:border file:border-line file:bg-muted file:px-3 file:py-1.5"
        />
        <Button type="submit" disabled={pending}>
          Upload
        </Button>
      </div>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}

type Row = { key: number; name: string; size: string; qty: number };

export function PackEditor({
  packId,
  price,
  items,
}: {
  packId: string;
  price: string;
  items: { name: string; size: string; qty: number }[];
}) {
  const [state, action, pending] = useActionState(packAction, {} as CompanyState);
  const [rows, setRows] = useState<Row[]>(() => items.map((i, key) => ({ key, ...i })));
  const [next, setNext] = useState(items.length);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="packId" value={packId} />
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        Price per family (LKR)
        <Input
          id={`${packId}-price`}
          name="price"
          defaultValue={price}
          inputMode="decimal"
          required
          className="max-w-40"
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Items for one family</legend>
        {rows.map((r, i) => (
          <div
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_2.25rem] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_6rem_4.5rem_2.5rem] sm:gap-2"
          >
            <Input
              id={`${packId}-name-${r.key}`}
              className="w-full min-w-0 px-2"
              name="name"
              defaultValue={r.name}
              aria-label={`Item ${i + 1} name`}
              required
              maxLength={80}
            />
            <Input
              id={`${packId}-size-${r.key}`}
              className="w-full min-w-0 px-2"
              name="size"
              defaultValue={r.size}
              aria-label={`Item ${i + 1} size`}
              maxLength={30}
            />
            <Input
              id={`${packId}-qty-${r.key}`}
              className="w-full min-w-0 px-2"
              name="qty"
              type="number"
              min={1}
              max={99}
              defaultValue={r.qty}
              aria-label={`Item ${i + 1} quantity`}
              required
            />
            <button
              type="button"
              className="min-h-10 rounded-md px-2 text-sm text-danger hover:bg-muted"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-muted"
          onClick={() => {
            setRows([...rows, { key: next, name: "", size: "", qty: 1 }]);
            setNext(next + 1);
          }}
        >
          + Add item
        </button>
      </fieldset>
      <Button type="submit" disabled={pending} className="self-start">
        Publish new version
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}
