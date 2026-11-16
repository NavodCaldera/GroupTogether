"use client";

/**
 * Body measurements for the fit report (DEC-020). Photos are analysed on this phone and never
 * uploaded: only height, the measurements with their uncertainty, corrections and consent are
 * sent, plus the downsampled body outlines and joints for the buyer's own 3D body (DEC-021).
 * Typed values always win over photo estimates.
 */
import "@/components/fit/capture/capture.css";
import { useActionState, useMemo, useState } from "react";
import { AdminForm } from "@/app/admin/admin-form";
import { CaptureFlow } from "@/components/fit/capture/ui/CaptureFlow";
import { outlineFor } from "@/components/fit/capture/measure/outline";
import { derive, usable, type Photos } from "@/components/fit/capture/ui/derive";
import { DEFAULT_MODELS } from "@/components/fit/capture/vision/mediapipe";
import type { BodyKey } from "@/components/fit/capture/types";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { REGION_LABEL, REGIONS, type Region } from "@/lib/fit/regions";
import { deleteBodyProfileAction, saveBodyProfileAction } from "@/server/fit-actions";

type Stored = { value: number; low: number; high: number; source: "photo" | "typed" };

export interface ProfileValues {
  heightCm: number;
  gender: string | null;
  ageBand: string | null;
  measurements: Partial<Record<Region, Stored>>;
}

/** 80% interval from one standard deviation. */
const Z = 1.28;
const half = (n: number) => Math.round(n * 2) / 2;
/** A typed tape measurement is good to about a centimetre. */
const TYPED_SPREAD = 1;

/** Photo measurements the capture can estimate, by area. */
const FROM_PHOTO: Partial<Record<Region, BodyKey>> = {
  chest: "chest",
  waist: "waist",
  hip: "hip",
  shoulder: "shoulder",
  torso: "torso",
};

const LABEL: Record<Region, string> = { ...REGION_LABEL, torso: "Torso (shoulder to hip)" };

/** Share of the image height the body fills; the two photos should match within 5%. */
function framing(m: { top: number; bottom: number } | null | undefined, h: number) {
  return m && h ? (m.bottom - m.top) / h : null;
}

export function FitOnboarding({
  profile,
  next,
  body3d,
}: {
  profile: ProfileValues | null;
  next: string;
  /** Send the outlines for the buyer's own 3D body (off until the accuracy test passes). */
  body3d: boolean;
}) {
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : "");
  const [gender, setGender] = useState(profile?.gender ?? "");
  const [ageBand, setAgeBand] = useState(profile?.ageBand ?? "");
  const [photos, setPhotos] = useState<Photos>({});
  const [capturing, setCapturing] = useState(false);
  const [typed, setTyped] = useState<Partial<Record<Region, string>>>(() =>
    Object.fromEntries(
      Object.entries(profile?.measurements ?? {}).map(([k, m]) => [k, String(m.value)]),
    ),
  );
  const [consent, setConsent] = useState(false);
  const [state, run, pending] = useActionState(saveBodyProfileAction, {});

  const h = Number(height) || 0;
  const { front, side, body } = useMemo(() => derive(photos, { height: h }), [photos, h]);
  const photoValue = (r: Region) => {
    const k = FROM_PHOTO[r];
    const e = k ? body[k] : undefined;
    return e && e.source === "photo" ? e : undefined;
  };
  const framed = [
    framing(front?.measure, photos.front?.image.height ?? 0),
    framing(side?.measure, photos.side?.image.height ?? 0),
  ];
  const framingOff =
    framed[0] !== null && framed[1] !== null && Math.abs(framed[0] - framed[1]) / framed[0] > 0.05;

  // Typed (or kept) values win; otherwise the photo estimate with its interval.
  const measurements: Partial<Record<Region, Stored>> = {};
  const corrections: Partial<Record<Region, { photo: number; typed: number }>> = {};
  for (const r of REGIONS) {
    const p = photoValue(r);
    const t = Number(typed[r]);
    const kept = profile?.measurements[r];
    if (typed[r] && t > 0) {
      const sameAsKept = kept && kept.value === t;
      measurements[r] = sameAsKept
        ? kept
        : { value: t, low: t - TYPED_SPREAD, high: t + TYPED_SPREAD, source: "typed" };
      if (p && Math.abs(p.value - t) >= 0.5) corrections[r] = { photo: half(p.value), typed: t };
    } else if (p) {
      measurements[r] = {
        value: half(p.value),
        low: half(p.value - Z * p.sd),
        high: half(p.value + Z * p.sd),
        source: "photo",
      };
    }
  }

  // The 3D body needs a usable front photo; the side photo sharpens the depth.
  const outlines = useMemo(
    () =>
      body3d && usable(photos.front)
        ? {
            front: outlineFor(photos.front),
            side: usable(photos.side) ? outlineFor(photos.side) : null,
          }
        : null,
    [photos, body3d],
  );

  const payload = JSON.stringify({
    heightCm: h,
    gender: gender || null,
    ageBand: ageBand || null,
    measurements,
    captureMeta: {
      photos: Object.keys(photos),
      model: DEFAULT_MODELS.still,
      issues: { front: front?.issues ?? [], side: side?.issues ?? [] },
      framingOff,
      corrections,
    },
    consent,
    outlines,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Height (cm)" name="heightCm">
          <Input
            name="heightCm"
            inputMode="decimal"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            required
          />
        </Field>
        <Field label="Fit (optional)" name="gender">
          <Select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">—</option>
            <option value="MEN">Men</option>
            <option value="WOMEN">Women</option>
          </Select>
        </Field>
        <Field label="Age (optional)" name="ageBand">
          <Select name="ageBand" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
            <option value="">—</option>
            {["18-29", "30-44", "45-59", "60+"].map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => setCapturing(true)} disabled={h < 100}>
          {photos.front || photos.side ? "Retake photos" : "Measure with camera"}
        </Button>
        {(["front", "side"] as const).map((v) => (
          <span key={v} className="text-sm text-subtle">
            {v === "front" ? "Front" : "Side"} {photos[v] ? "✓" : "—"}
          </span>
        ))}
      </div>
      {framingOff && <Alert>Stand at the same distance for both photos, then retake them.</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {REGIONS.map((r) => {
          const m = measurements[r];
          const p = photoValue(r);
          return (
            <Field key={r} label={`${LABEL[r]} (cm)`} name={`m-${r}`}>
              <Input
                name={`m-${r}`}
                inputMode="decimal"
                placeholder={p ? String(half(p.value)) : ""}
                value={typed[r] ?? ""}
                onChange={(e) => setTyped((t) => ({ ...t, [r]: e.target.value }))}
              />
              <span className="text-xs text-subtle tabular-nums" data-testid={`range-${r}`}>
                {m ? `${m.low}–${m.high}` : " "}
              </span>
            </Field>
          );
        })}
      </div>

      <form action={run} className="flex flex-col gap-3">
        <input type="hidden" name="profile" value={payload} />
        <input type="hidden" name="next" value={next} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="size-4"
          />
          Save my measurements to my account
        </label>
        <Button type="submit" disabled={pending || !consent || h < 100}>
          {pending ? "Working…" : "Save measurements"}
        </Button>
        {state.error && <Alert>{state.error}</Alert>}
      </form>

      {profile && (
        <AdminForm
          action={deleteBodyProfileAction}
          submit="Delete my measurements"
          variant="danger"
        />
      )}

      {capturing && (
        <div className="fit-capture">
          <CaptureFlow
            views={["front", "side"]}
            height={h}
            photos={photos}
            models={DEFAULT_MODELS}
            onAccept={(photo) => setPhotos((p) => ({ ...p, [photo.view]: photo }))}
            onClose={() => setCapturing(false)}
          />
        </div>
      )}
    </div>
  );
}
