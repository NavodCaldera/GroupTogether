"use client";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Input, Select, Textarea } from "./ui";
import { returnAction, type ReturnState } from "@/server/return-actions";
import { REPORT_REASONS } from "@/lib/quality-rules";
export function ReturnForm({
  id,
  op,
  maxQty = 1,
  action: custom,
}: {
  id: string;
  op: "file" | "factory" | "admin" | "received" | "message";
  maxQty?: number;
  /** Replaces the shared return action, e.g. the buyer order page's own */
  action?: (previous: ReturnState, fd: FormData) => Promise<ReturnState>;
}) {
  const [state, action, pending] = useActionState(custom ?? returnAction, {});
  const [fault, setFault] = useState("FACTORY");
  const [decision, setDecision] = useState("accept");
  const [restock, setRestock] = useState("yes");
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
      {(op === "file" ||
        op === "admin" ||
        op === "received" ||
        (op === "factory" && decision === "reject")) && (
        <>
          <label htmlFor={`${uid}-note`}>
            {op === "received"
              ? "Condition note"
              : op === "factory"
                ? "Refusal reason"
                : "Return note"}
          </label>
          <Textarea
            id={`${uid}-note`}
            name="note"
            maxLength={op === "factory" ? 1000 : 2000}
            required={op !== "received"}
          />
        </>
      )}
      {(op === "factory" || op === "admin") && (
        <>
          <label htmlFor={`${uid}-decision`}>Decision</label>
          <Select
            id={`${uid}-decision`}
            name="decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            <option value="accept">Accept</option>
            <option value="reject">Reject</option>
          </Select>
        </>
      )}
      {op === "received" && (
        <>
          <label htmlFor={`${uid}-restock`}>Put back in stock</label>
          <Select
            id={`${uid}-restock`}
            name="restock"
            value={restock}
            onChange={(e) => setRestock(e.target.value)}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </>
      )}
      {op === "message" && (
        <>
          <label htmlFor={`${uid}-body`}>Message</label>
          <Textarea id={`${uid}-body`} name="body" required maxLength={1000} />
        </>
      )}
      <Button disabled={pending} className="hover:opacity-100!">
        {
          {
            file: "Request return",
            factory: "Save decision",
            admin: "Save final decision",
            received: "Mark received",
            message: "Send message",
          }[op]
        }
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
