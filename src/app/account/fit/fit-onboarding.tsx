"use client";

/**
 * Body measurements for the fit report (DEC-020). Photos are analysed on this phone and never
 * uploaded: only height, the measurements with their uncertainty, corrections and consent are
 * sent, plus the downsampled body outlines and joints for the buyer's own 3D body (DEC-021).
 * Typed values always win over photo estimates.
 */
import "@/components/fit/capture/capture.css";
import { type ReactNode, type Ref, useActionState, useMemo, useRef, useState } from "react";
import { AdminForm } from "@/app/admin/admin-form";
import { CaptureFlow } from "@/components/fit/capture/ui/CaptureFlow";
import { outlineFor } from "@/components/fit/capture/measure/outline";
import { derive, usable, type Photos } from "@/components/fit/capture/ui/derive";
import { DEFAULT_MODELS } from "@/components/fit/capture/vision/mediapipe";
import type { BodyKey } from "@/components/fit/capture/types";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { REGION_LABEL, REGIONS, type Region } from "@/lib/fit/regions";
import { BodyGuide } from "./body-guide";
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
  start,
  next,
  body3d,
}: {
  profile: ProfileValues | null;
  /** Fit and age group from the buyer's sign-up details, used until a profile is saved. */
  start?: { gender: string | null; ageBand: string | null };
  next: string;
  /** Send the outlines for the buyer's own 3D body (off until the accuracy test passes). */
  body3d: boolean;
}) {
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : "");
  const [gender, setGender] = useState(profile?.gender ?? start?.gender ?? "");
  const [ageBand, setAgeBand] = useState(profile?.ageBand ?? start?.ageBand ?? "");
  const [photos, setPhotos] = useState<Photos>({});
  const [capturing, setCapturing] = useState(false);
  const [typed, setTyped] = useState<Partial<Record<Region, string>>>(() =>
    Object.fromEntries(
      Object.entries(profile?.measurements ?? {}).map(([k, m]) => [k, String(m.value)]),
    ),
  );
  const [consent, setConsent] = useState(false);
  const [heightError, setHeightError] = useState("");
  const [focus, setFocus] = useState<Region | null>(null);
  const heightRef = useRef<HTMLInputElement>(null);
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

  const needHeight = () => {
    setHeightError("Enter your height in cm");
    heightRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-5">
      <Section title="About you">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CmField
            label="Height"
            name="heightCm"
            inputRef={heightRef}
            value={height}
            error={heightError}
            onChange={(v) => {
              setHeight(v);
              setHeightError("");
            }}
          />
          <Field label="Fit" name="gender">
            <Select name="gender" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Not set</option>
              <option value="MEN">Men</option>
              <option value="WOMEN">Women</option>
            </Select>
          </Field>
          <Field label="Age group" name="ageBand">
            <Select name="ageBand" value={ageBand} onChange={(e) => setAgeBand(e.target.value)}>
              <option value="">Not set</option>
              {["18-29", "30-44", "45-59", "60+"].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section
        title="Measurements"
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => (h < 100 ? needHeight() : setCapturing(true))}
          >
            <CameraIcon />
            {photos.front || photos.side ? "Retake photos" : "Measure with camera"}
          </Button>
        }
      >
        {(photos.front || photos.side) && (
          <div className="flex gap-2">
            {(["front", "side"] as const).map((v) => (
              <Badge key={v} tone={photos[v] ? "good" : "neutral"}>
                {v === "front" ? "Front" : "Side"} {photos[v] ? "✓" : "—"}
              </Badge>
            ))}
          </div>
        )}
        {framingOff && <Alert>Stand at the same distance for both photos, then retake them.</Alert>}
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <BodyGuide active={focus} label={(r) => LABEL[r]} fit={gender} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {REGIONS.map((r) => {
              const m = measurements[r];
              const p = photoValue(r);
              return (
                <CmField
                  key={r}
                  label={LABEL[r]}
                  name={`m-${r}`}
                  placeholder={p ? String(half(p.value)) : ""}
                  value={typed[r] ?? ""}
                  onChange={(v) => setTyped((t) => ({ ...t, [r]: v }))}
                  onFocus={(on) => setFocus(on ? r : null)}
                  below={
                    <span
                      className="block min-h-4 text-xs text-subtle tabular-nums"
                      data-testid={`range-${r}`}
                    >
                      {m ? `${m.low}–${m.high}` : ""}
                    </span>
                  }
                />
              );
            })}
          </div>
        </div>
      </Section>

      <form
        action={run}
        onSubmit={(e) => {
          if (h < 100) {
            e.preventDefault();
            needHeight();
          }
        }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <input type="hidden" name="profile" value={payload} />
        <input type="hidden" name="next" value={next} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]"
          />
          Save my measurements to my account
        </label>
        <Button type="submit" disabled={pending} className="sm:px-8">
          {pending ? "Working…" : "Save measurements"}
        </Button>
        {state.error && <Alert>{state.error}</Alert>}
      </form>

      {profile && (
        <div className="border-t border-line pt-5">
          <AdminForm
            action={deleteBodyProfileAction}
            submit="Delete my measurements"
            variant="secondary"
            className="flex justify-end"
          />
        </div>
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

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `fit-${title.toLowerCase().replace(/s+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="px-1 text-sm font-semibold tracking-wide text-subtle uppercase">
        {title}
      </h2>
      <Card className="flex flex-col gap-4">
        {action && <div className="flex flex-wrap items-center gap-3">{action}</div>}
        {children}
      </Card>
    </section>
  );
}

/** A number field with a "cm" suffix; the unit stays in the accessible name. */
function CmField({
  label,
  name,
  value,
  onChange,
  placeholder,
  error,
  below,
  inputRef,
  onFocus,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  below?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  /** Called with true when the field is focused or hovered, false when left. */
  onFocus?: (on: boolean) => void;
}) {
  return (
    <Field label={label} name={name} error={error}>
      <div
        className="relative"
        onMouseEnter={() => onFocus?.(true)}
        onMouseLeave={() => onFocus?.(false)}
        onFocus={() => onFocus?.(true)}
        onBlur={() => onFocus?.(false)}
      >
        <Input
          ref={inputRef}
          name={name}
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} (cm)`}
          aria-invalid={error ? true : undefined}
          className="w-full pr-11 tabular-nums"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-subtle">
          cm
        </span>
      </div>
      {below}
    </Field>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
