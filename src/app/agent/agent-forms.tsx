"use client";
import { useActionState, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
import type { PickupLine } from "@/server/orders/handover";
import { Toast } from "@/components/toast";
import {
  type AgentState,
  type CodeState,
  closeResaleAction,
  collectReturnAction,
  handOverAction,
  leaveAction,
  lookupCodeAction,
  markReceivedAction,
  saveHoursAction,
  sendTokensAction,
} from "./actions";

/** Type a buyer's code, see their items, tick what goes out and hand over. */
export function HandOverBox() {
  const [found, lookup, looking] = useActionState<CodeState, FormData>(lookupCodeAction, {});
  const [done, give, giving] = useActionState<CodeState, FormData>(handOverAction, {});
  const [code, setCode] = useState("");
  // A new lookup is newer than the last hand over, so its items show again.
  const showLines = found.lines && found.code === code && (found.at ?? 0) > (done.at ?? 0);
  return (
    <div className="flex flex-col gap-3">
      <form action={lookup} className="flex gap-2">
        <label htmlFor="pickup-code" className="sr-only">
          Pickup code
        </label>
        <Input
          id="pickup-code"
          name="code"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{6}"
          maxLength={6}
          placeholder="000000"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="min-w-0 flex-1 text-center text-2xl tracking-[0.3em] tabular-nums sm:text-2xl"
        />
        <Button type="submit" disabled={looking}>
          Find
        </Button>
      </form>
      {found.error && found.code === code && <Alert>{found.error}</Alert>}
      {showLines && (
        <HandOverItems
          key={found.at}
          code={found.code!}
          buyerName={found.buyerName ?? ""}
          lines={found.lines!}
          error={done.error}
          give={give}
          giving={giving}
        />
      )}
      {done.ok && <Toast key={done.at}>{done.ok}</Toast>}
    </div>
  );
}

/** The buyer's items with the cash agent fee for the ticked ones; the agent confirms the fee. */
function HandOverItems({
  code,
  buyerName,
  lines,
  error,
  give,
  giving,
}: {
  code: string;
  buyerName: string;
  lines: PickupLine[];
  error?: string;
  give: (fd: FormData) => void;
  giving: boolean;
}) {
  const [off, setOff] = useState<string[]>([]);
  const fee = lines
    .filter((l) => !off.includes(l.id))
    .reduce((sum, l) => sum.plus(l.fee), new D(0));
  return (
    <form action={give} className="flex flex-col gap-2">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="fee" value={fee.toFixed(2)} />
      <p className="font-semibold">{buyerName}</p>
      <fieldset className="flex flex-col divide-y divide-line rounded-lg border border-line">
        <legend className="sr-only">Items to hand over</legend>
        {lines.map((l) => (
          <label key={l.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="line"
              value={l.id}
              checked={!off.includes(l.id)}
              onChange={(e) =>
                setOff((ids) =>
                  e.target.checked ? ids.filter((id) => id !== l.id) : [...ids, l.id],
                )
              }
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0 flex-1">{[l.title, l.label].filter(Boolean).join(" · ")}</span>
            <span className="tabular-nums">× {l.qty}</span>
          </label>
        ))}
      </fieldset>
      {fee.gt(0) && (
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold">
          <input
            type="checkbox"
            name="feeReceived"
            required
            className="size-5 shrink-0 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">Fee received</span>
          <span className="tabular-nums">{formatLKR(fee)}</span>
        </label>
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={giving}>
        Hand over
      </Button>
    </form>
  );
}

/** Mark a basket received, ticking the held returns that go back with this courier. */
export function ReceiveForm({
  basketId,
  returns,
}: {
  basketId: string;
  returns: { id: string; item: string; qty: number }[];
}) {
  const [state, action, pending] = useActionState<AgentState, FormData>(
    markReceivedAction.bind(null, basketId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      {returns.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-bold">Returns to send back</legend>
          {returns.map((r) => (
            <label key={r.id} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="return"
                value={r.id}
                className="size-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1">{r.item}</span>
              <span className="tabular-nums">× {r.qty}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        Mark received
      </Button>
    </form>
  );
}

export function CollectButton({ returnId }: { returnId: string }) {
  const [state, action, pending] = useActionState<AgentState, FormData>(
    collectReturnAction.bind(null, returnId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        Collected
      </Button>
    </form>
  );
}

export function ResaleButtons({ returnId }: { returnId: string }) {
  const [sold, soldAction, soldPending] = useActionState<AgentState, FormData>(
    closeResaleAction.bind(null, returnId, "SOLD"),
    {},
  );
  const [back, backAction, backPending] = useActionState<AgentState, FormData>(
    closeResaleAction.bind(null, returnId, "TAKEN_BACK"),
    {},
  );
  const error = sold.error ?? back.error;
  return (
    <div className="flex flex-col gap-2">
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <form action={soldAction}>
          <Button type="submit" variant="secondary" disabled={soldPending || backPending}>
            Sold
          </Button>
        </form>
        <form action={backAction}>
          <Button type="submit" variant="ghost" disabled={soldPending || backPending}>
            Taken back
          </Button>
        </form>
      </div>
    </div>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) =>
  m >= 24 * 60
    ? "23:59"
    : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function HoursForm({
  hours,
}: {
  hours: { weekday: number; opensAt: number; closesAt: number }[];
}) {
  const [state, action, pending] = useActionState<AgentState, FormData>(saveHoursAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {DAYS.map((day, weekday) => {
          const h = hours.find((x) => x.weekday === weekday);
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
              <label className="flex min-h-11 w-32 items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  name={`open-${weekday}`}
                  defaultChecked={!!h}
                  className="size-5 accent-[var(--accent)]"
                />
                {day}
              </label>
              <div className="flex flex-1 items-center gap-2">
                <label htmlFor={`opens-${weekday}`} className="sr-only">
                  {day} opens
                </label>
                <Input
                  id={`opens-${weekday}`}
                  name={`opens-${weekday}`}
                  type="time"
                  defaultValue={hhmm(h?.opensAt ?? 9 * 60)}
                  className="min-w-0 flex-1"
                />
                <span aria-hidden>–</span>
                <label htmlFor={`closes-${weekday}`} className="sr-only">
                  {day} closes
                </label>
                <Input
                  id={`closes-${weekday}`}
                  name={`closes-${weekday}`}
                  type="time"
                  defaultValue={hhmm(h?.closesAt ?? 18 * 60)}
                  className="min-w-0 flex-1"
                />
              </div>
            </li>
          );
        })}
      </ul>
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <Toast key={state.at}>{state.ok}</Toast>}
      <Button type="submit" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

export function SendTokensForm({ requestKey }: { requestKey: string }) {
  const [state, action, pending] = useActionState<AgentState, FormData>(sendTokensAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestKey" value={requestKey} />
      <Field label="Phone or email" name="to">
        <Input name="to" autoComplete="off" required />
      </Field>
      <Field label="Amount (LKR)" name="amount">
        <Input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>
        Send
      </Button>
    </form>
  );
}

/** Leave in two steps: the first press asks, the second confirms. */
export function LeaveButton() {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState<AgentState, FormData>(leaveAction, {});
  if (!asking)
    return (
      <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
        Leave
      </Button>
    );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="confirm" value="yes" />
      <p className="font-medium">Stop taking orders?</p>
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          Confirm leave
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
