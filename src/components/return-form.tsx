"use client";
import { useActionState, useId, useState } from "react";
import { Alert, Button, Input, Select, Textarea } from "./ui";
import { returnAction, type ReturnState } from "@/server/return-actions";
import { REPORT_REASONS } from "@/lib/quality-rules";
import { BUYER_FAULT_LABEL, BUYER_FAULT_REASONS } from "@/lib/return-rules";
import { D } from "@/lib/decimal";
import { formatLKR } from "@/lib/format";
export function ReturnForm({
  id,
  op,
  maxQty = 1,
  buyerShare,
  action: custom,
}: {
  id: string;
  op: "file" | "factory" | "admin" | "received" | "message" | "buyer-decide" | "change-to-buyer";
  maxQty?: number;
  /** Factory price of one piece: what a buyer gets per piece if a buyer-fault return sells */
  buyerShare?: string;
  /** Replaces the shared return action, e.g. the buyer order page's own */
  action?: (previous: ReturnState, fd: FormData) => Promise<ReturnState>;
}) {
  const [state, action, pending] = useActionState(custom ?? returnAction, {});
  const [fault, setFault] = useState("FACTORY");
  const [decision, setDecision] = useState("accept");
  const [restock, setRestock] = useState("yes");
  const [qty, setQty] = useState(1);
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
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.trunc(Number(e.target.value) || 1)))}
            required
          />
          <label htmlFor={`${uid}-fault`}>Fault</label>
          <Select
            id={`${uid}-fault`}
            name="fault"
            value={fault}
            onChange={(e) => setFault(e.target.value)}
          >
            <option value="FACTORY">Factory fault</option>
            <option value="BUYER">Buyer fault</option>
          </Select>
          <label htmlFor={`${uid}-reason`}>Return reason</label>
          {fault === "FACTORY" ? (
            <Select id={`${uid}-reason`} name="reason" required>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ").toLowerCase()}
                </option>
              ))}
            </Select>
          ) : (
            <Select id={`${uid}-reason`} name="buyerReason" required>
              {BUYER_FAULT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {BUYER_FAULT_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
          {fault === "BUYER" && buyerShare && (
            <p className="font-semibold">
              You get {formatLKR(new D(buyerShare).times(qty))} if it sells
            </p>
          )}
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
        op === "buyer-decide" ||
        op === "change-to-buyer" ||
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
            required={op !== "received" && op !== "buyer-decide"}
          />
        </>
      )}
      {(op === "factory" || op === "admin" || op === "buyer-decide") && (
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
            "buyer-decide": "Save decision",
            "change-to-buyer": "Change to buyer fault",
            received: "Mark received",
            message: "Send message",
          }[op]
        }
      </Button>
      {state.error && <Alert>{state.error}</Alert>}
    </form>
  );
}
