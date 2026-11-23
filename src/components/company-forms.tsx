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

type Item = { name: string; size: string; qty: number; retailPrice: string; photo: string | null };
type Row = Item & { key: number };

export function PackEditor({
  packId,
  price,
  discounts,
  items,
}: {
  packId: string;
  price: string;
  discounts: { discount5: string; discount10: string; discount15: string };
  items: Item[];
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
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-bold">Discount by basket size (%)</legend>
        {([5, 10, 15] as const).map((n) => (
          <label key={n} className="flex flex-col gap-1 text-sm">
            {n} families
            <Input
              id={`${packId}-discount${n}`}
              name={`discount${n}`}
              defaultValue={discounts[`discount${n}`]}
              inputMode="decimal"
              required
              className="w-24"
            />
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">Items for one family</legend>
        {rows.map((r, i) => (
          <div key={r.key} className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
            <input type="hidden" name="photoUrl" value={r.photo ?? ""} />
            <div className="flex items-center gap-2">
              {r.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.photo}
                  alt=""
                  className="size-11 shrink-0 rounded-md bg-muted object-cover"
                />
              ) : null}
              <Input
                id={`${packId}-name-${r.key}`}
                className="w-full min-w-0 px-2"
                name="name"
                defaultValue={r.name}
                aria-label={`Item ${i + 1} name`}
                required
                maxLength={80}
              />
              <button
                type="button"
                className="min-h-10 shrink-0 rounded-md px-2 text-sm text-danger hover:bg-muted"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-subtle">
              <label className="flex min-w-0 flex-col gap-1">
                Size
                <Input
                  id={`${packId}-size-${r.key}`}
                  className="w-full min-w-0 px-2"
                  name="size"
                  defaultValue={r.size}
                  aria-label={`Item ${i + 1} size`}
                  maxLength={30}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                Quantity
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
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                Shop price
                <Input
                  id={`${packId}-retail-${r.key}`}
                  className="w-full min-w-0 px-2"
                  name="retail"
                  inputMode="decimal"
                  defaultValue={r.retailPrice}
                  aria-label={`Item ${i + 1} shop price (LKR)`}
                />
              </label>
            </div>
            <input
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Item ${i + 1} photo`}
              className="min-w-0 max-w-full text-xs file:mr-2 file:rounded-md file:border file:border-line file:bg-muted file:px-2 file:py-1"
            />
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-muted"
          onClick={() => {
            setRows([
              ...rows,
              { key: next, name: "", size: "", qty: 1, retailPrice: "", photo: null },
            ]);
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
