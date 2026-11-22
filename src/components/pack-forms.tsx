"use client";
import { useActionState } from "react";
import { joinGroupAction, setPickupAction, startGroupAction, type PackState } from "@/server/pack-actions";
import { Alert, Button, Select } from "./ui";

type Act = (p: PackState, fd: FormData) => Promise<PackState>;

function ActionForm({
  act,
  fields,
  label,
  variant = "primary",
  children,
}: {
  act: Act;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(act, {});
  return (
    <form action={action} className="flex min-w-0 flex-col gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {label}
      </Button>
      {state.error ? <Alert>{state.error}</Alert> : null}
    </form>
  );
}

export function PickupForm({
  path,
  points,
  current,
}: {
  path: string;
  points: { id: string; label: string }[];
  current: string | null;
}) {
  return (
    <ActionForm act={setPickupAction} fields={{ path }} label="Save pickup point" variant="secondary">
      <Select name="agentId" defaultValue={current ?? ""} aria-label="Pickup point" required>
        <option value="" disabled>
          Choose a pickup point
        </option>
        {points.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
    </ActionForm>
  );
}

export function JoinForm({ path, groupId }: { path: string; groupId: string }) {
  return <ActionForm act={joinGroupAction} fields={{ path, groupId }} label="Join this group" />;
}

export function StartForm({ path, versionId }: { path: string; versionId: string }) {
  return <ActionForm act={startGroupAction} fields={{ path, versionId }} label="Start a group" />;
}
