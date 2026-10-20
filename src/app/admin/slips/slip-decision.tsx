"use client";

import { useActionState, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { approveSlipAction, rejectSlipAction } from "@/server/admin-actions";

/** Reasons the owner sees most often; the field takes any text. */
const REASONS = [
  "Amount doesn't match",
  "Cart code missing from the reference",
  "Can't read the slip",
  "Paid into the wrong account",
  "Old or reused slip",
];

/**
 * Approve or reject one slip. Approving can't be undone, so it asks once more; rejecting asks why.
 * On phones the bar is docked at the bottom of the screen; from `lg` up it sits in the panel.
 */
export function SlipDecision({
  slipId,
  amount,
  code,
}: {
  slipId: string;
  amount: string;
  code: string;
}) {
  const [step, setStep] = useState<"choose" | "approve" | "reject">("choose");
  const [approveState, approve, approving] = useActionState(approveSlipAction, {});
  const [rejectState, reject, rejecting] = useActionState(rejectSlipAction, {});
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.12)] lg:static lg:z-auto lg:border-0 lg:p-0 lg:shadow-none">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        {error && <Alert>{error}</Alert>}

        {step === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setStep("reject")}>
              Reject…
            </Button>
            <Button onClick={() => setStep("approve")}>Approve…</Button>
          </div>
        )}

        {step === "approve" && (
          <form action={approve} className="flex flex-col gap-3">
            <input type="hidden" name="slipId" value={slipId} />
            <p className="text-sm">
              Approve <strong>{amount}</strong> for cart{" "}
              <strong className="font-mono">{code}</strong>? The order is confirmed and the stock is
              sold. This can&apos;t be undone.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("choose")}
                disabled={approving}
              >
                Back
              </Button>
              <Button type="submit" disabled={approving}>
                {approving ? "Working…" : "Yes, approve"}
              </Button>
            </div>
          </form>
        )}

        {step === "reject" && (
          <form action={reject} className="flex flex-col gap-3">
            <input type="hidden" name="slipId" value={slipId} />
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Why is it rejected?</span>
              <Input
                name="note"
                list="slip-reject-reasons"
                placeholder="Pick or type a reason"
                required
                minLength={3}
                maxLength={300}
                autoFocus
              />
              <datalist id="slip-reject-reasons">
                {REASONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep("choose")}
                disabled={rejecting}
              >
                Back
              </Button>
              <Button type="submit" variant="danger" disabled={rejecting}>
                {rejecting ? "Working…" : "Reject slip"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
