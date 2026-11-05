"use client";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Input, Select, Textarea } from "./ui";
import { returnAction } from "@/server/return-actions";
import { REPORT_REASONS } from "@/lib/quality-rules";
export function ReturnForm({
  id,
  op,
  maxQty = 1,
  buyerFault = false,
}: {
  id: string;
  op: "file" | "factory" | "admin" | "received" | "pickup" | "escalate" | "picked-up";
  maxQty?: number;
  buyerFault?: boolean;
}) {
  const [state, action, pending] = useActionState(returnAction, {});
  const [fault, setFault] = useState("FACTORY");
  const uid = useId();
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      {op === "file" && (
        <>
          <label htmlFor={`${uid}-qty`}>Return quantity</label>
          <Input
            id={`${uid}-qty`}
            name="qty"
            type="number"
            min={1}
            max={maxQty}
            defaultValue={1}
            required
          />
          <label htmlFor={`${uid}-reason`}>Return reason</label>
          <Select id={`${uid}-reason`} name="reason" required>
            {REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </Select>
          <label htmlFor={`${uid}-fault`}>Fault</label>
          <Select
            id={`${uid}-fault`}
            name="fault"
            value={fault}
            onChange={(e) => setFault(e.target.value)}
          >
            <option value="FACTORY">Factory</option>
            <option value="BUYER">Buyer</option>
          </Select>
          <label htmlFor={`${uid}-photos`}>Return photos</label>
          <input
            id={`${uid}-photos`}
            name="photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            required={fault === "FACTORY"}
            className="max-w-full min-w-0 text-base"
          />
        </>
      )}
      {(op === "file" || op === "admin" || op === "received") && (
        <>
          <label htmlFor={`${uid}-note`}>
            {op === "received" ? "Condition note" : "Return note"}
          </label>
          <Textarea
            id={`${uid}-note`}
            name="note"
            maxLength={2000}
            required={op !== "received" || buyerFault}
          />
        </>
      )}
      {(op === "factory" || op === "admin") && (
        <>
          <label htmlFor={`${uid}-decision`}>Decision</label>
          <Select id={`${uid}-decision`} name="decision">
            <option value="accept">Accept</option>
            <option value="reject">Reject</option>
          </Select>
        </>
      )}
      {op === "received" && buyerFault && (
        <>
          <label htmlFor={`${uid}-unused`}>Unused with tags</label>
          <Select id={`${uid}-unused`} name="unused">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </>
      )}
      {op === "received" && !buyerFault && <input type="hidden" name="unused" value="yes" />}
      {op === "pickup" && (
        <>
          <label htmlFor={`${uid}-ref`}>PickMe reference</label>
          <Input id={`${uid}-ref`} name="reference" maxLength={200} required />
          <label htmlFor={`${uid}-driver`}>Driver</label>
          <Input id={`${uid}-driver`} name="driver" maxLength={200} />
        </>
      )}
      <Button disabled={pending}>
        {
          {
            file: "Request return",
            factory: "Save decision",
            admin: "Save final decision",
            received: "Mark received",
            pickup: "Save pickup",
            escalate: "Ask an admin",
            "picked-up": "Mark picked up",
          }[op]
        }
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
