"use client";

/**
 * The buyer's own 3D body (DEC-021): building, then "does this look like you?" with chest,
 * waist and hip to rebuild from the kept outlines, then confirmed. The body file is private.
 */
import { lazy, Suspense, useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminForm } from "@/app/admin/admin-form";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { BodyModel } from "@/server/body-fit";
import { confirmBodyAction, deleteBodyAction, rebuildBodyAction } from "@/server/fit-actions";

const FitViewer = lazy(() => import("@/components/fit/fit-viewer"));
const NONE = [0, 0, 0, 0, 0, 0, 0];
const GIRTHS = [
  { id: "chest", label: "Chest (cm)" },
  { id: "waist", label: "Waist (cm)" },
  { id: "hip", label: "Hip (cm)" },
] as const;

function BodyViewer({ version }: { version: string }) {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  const onReady = useCallback(() => setFailed(false), []);
  if (failed) return <Alert>3D body unavailable</Alert>;
  return (
    <div className="h-96 w-full overflow-hidden rounded-xl bg-muted">
      <Suspense fallback={null}>
        <FitViewer
          key={version}
          url={`/api/fit-body?v=${version}`}
          tensions={NONE}
          unsure={NONE}
          heat={false}
          playing={false}
          speed={1}
          onError={onError}
          onReady={onReady}
        />
      </Suspense>
    </div>
  );
}

export function BodyCheck({ body }: { body: BodyModel }) {
  const router = useRouter();
  const [rebuild, runRebuild, rebuilding] = useActionState(rebuildBodyAction, {});

  // The worker takes ~20 s to a few minutes: refresh until the body is ready.
  useEffect(() => {
    if (body.status !== "BUILDING") return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [body.status, router]);

  return (
    <section className="flex flex-col gap-4" aria-label="My 3D body" data-testid="body-check">
      <h2 className="text-lg font-semibold">My 3D body</h2>

      {body.status === "BUILDING" && (
        <p className="text-sm text-subtle" role="status">
          Building…
        </p>
      )}
      {body.status === "FAILED" && <Alert>We couldn&apos;t build your 3D body</Alert>}

      {(body.status === "CHECK" || body.status === "CONFIRMED") && (
        <BodyViewer version={body.version} />
      )}

      {body.status === "CHECK" && (
        <>
          <h3 className="font-medium">Does this look like you?</h3>
          <AdminForm action={confirmBodyAction} submit="Looks like me" />
        </>
      )}

      {(body.status === "CHECK" || body.status === "FAILED") && body.canAdjust && (
        <form action={runRebuild} className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {GIRTHS.map((g) => (
              <Field key={g.id} label={g.label} name={g.id}>
                <Input
                  name={g.id}
                  inputMode="decimal"
                  defaultValue={body.measurements[g.id] ? String(body.measurements[g.id]) : ""}
                />
              </Field>
            ))}
          </div>
          <Button type="submit" variant="secondary" disabled={rebuilding}>
            {rebuilding ? "Working…" : "Rebuild"}
          </Button>
          {rebuild.error && <Alert>{rebuild.error}</Alert>}
        </form>
      )}

      <AdminForm action={deleteBodyAction} submit="Delete my 3D body" variant="danger" />
    </section>
  );
}
