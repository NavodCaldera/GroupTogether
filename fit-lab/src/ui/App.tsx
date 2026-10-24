import { useMemo, useRef, useState } from "react";
import { limitations } from "../fit/limitations";
import { recommend, type DimensionFit, type Recommendation } from "../fit/predict";
import { GARMENTS, type GarmentKey } from "../garments/database";
import { BODY_LABEL, GARMENT_LABEL, verdictLabel } from "../labels";
import { BLOCKING } from "../measure/quality";
import type { Body, BodyKey, View } from "../types";
import { analyzePhoto } from "../vision/analyze";
import { DEFAULT_MODELS, type Models } from "../vision/mediapipe";
import { CaptureFlow } from "./CaptureFlow";
import { derive, type Measured, type Photos } from "./derive";
import { useStored } from "./hooks";
import { ModelTest } from "./ModelTest";
import { IssueChips, PhotoCanvas } from "./PhotoCanvas";

const TYPED: BodyKey[] = ["height", "shoulder", "chest", "waist", "hip", "sleeve", "inseam"];
const SHOWN: BodyKey[] = [
  "height",
  "shoulder",
  "chest",
  "waist",
  "hip",
  "sleeve",
  "torso",
  "inseam",
];
const VIEWS: View[] = ["front", "side"];
const TITLE: Record<View, string> = { front: "Front", side: "Side" };

const cm = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const signed = (n: number) => (n > 0 ? "+" : "") + cm(n);

export function App() {
  const [typed, setTyped] = useStored<Partial<Record<BodyKey, number>>>("fit-lab.typed", {});
  const [garmentId, setGarmentId] = useStored("fit-lab.garment", GARMENTS[0].id);
  const [models, setModels] = useStored<Models>("fit-lab.models", DEFAULT_MODELS);
  const [photos, setPhotos] = useState<Photos>({});
  const [busy, setBusy] = useState<Partial<Record<View, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<View, string>>>({});
  const [flow, setFlow] = useState<View[] | null>(null);

  const garment = GARMENTS.find((g) => g.id === garmentId) ?? GARMENTS[0];
  const { front, side, body } = useMemo(() => derive(photos, typed), [photos, typed]);
  const rec = useMemo(() => recommend(garment, body), [garment, body]);
  const height = typed.height ?? 0;
  const missing = VIEWS.filter((v) => !photos[v]);

  async function upload(view: View, file: File) {
    setBusy((b) => ({ ...b, [view]: true }));
    setErrors((e) => ({ ...e, [view]: undefined }));
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const photo = await analyzePhoto(bmp, bmp.width, bmp.height, view, models.still);
      setPhotos((p) => ({ ...p, [view]: photo }));
    } catch (err) {
      setErrors((e) => ({ ...e, [view]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy((b) => ({ ...b, [view]: false }));
    }
  }

  return (
    <main>
      <h1>Fit lab</h1>

      <section>
        <h2>You</h2>
        <form className="grid" onSubmit={(e) => e.preventDefault()}>
          {TYPED.map((k) => (
            <label key={k}>
              <span>
                {BODY_LABEL[k]} (cm){k === "height" && <span className="req"> *</span>}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                name={k}
                required={k === "height"}
                defaultValue={typed[k] ?? ""}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTyped((t) => {
                    const next = { ...t };
                    if (v > 0) next[k] = v;
                    else delete next[k];
                    return next;
                  });
                }}
              />
            </label>
          ))}
        </form>
      </section>

      <section>
        <div className="section-head">
          <h2>Photos</h2>
          <button
            type="button"
            className="primary"
            disabled={!height}
            onClick={() => setFlow(missing.length ? missing : VIEWS)}
          >
            {missing.length === 2
              ? "Start capture"
              : missing.length
                ? `Capture ${TITLE[missing[0]].toLowerCase()}`
                : "Capture again"}
          </button>
        </div>
        <div className="photos">
          {VIEWS.map((v) => (
            <PhotoCard
              key={v}
              view={v}
              photos={photos}
              measured={v === "front" ? front : side}
              busy={!!busy[v]}
              error={errors[v]}
              height={height}
              onRetake={() => setFlow([v])}
              onUpload={(f) => void upload(v, f)}
              onRemove={() =>
                setPhotos((p) => {
                  const next = { ...p };
                  delete next[v];
                  return next;
                })
              }
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Body</h2>
        <BodyTable body={body} />
      </section>

      <section>
        <h2>Fit</h2>
        <select
          aria-label="Garment"
          value={garment.id}
          onChange={(e) => setGarmentId(e.target.value)}
        >
          {GARMENTS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} · {g.fit} · {g.fabric.name}
            </option>
          ))}
        </select>
        <FitResult rec={rec} />
      </section>

      <ModelTest models={models} onModels={setModels} typed={typed} />

      {flow && (
        <CaptureFlow
          views={flow}
          height={height}
          photos={photos}
          models={models}
          onAccept={(photo) => setPhotos((p) => ({ ...p, [photo.view]: photo }))}
          onClose={() => setFlow(null)}
        />
      )}
    </main>
  );
}

function PhotoCard(props: {
  view: View;
  photos: Photos;
  measured: Measured | null;
  busy: boolean;
  error?: string;
  height: number;
  onRetake: () => void;
  onUpload: (f: File) => void;
  onRemove: () => void;
}) {
  const { view, photos, measured, busy, error, height } = props;
  const photo = photos[view];
  const fileRef = useRef<HTMLInputElement>(null);
  const issues = measured?.issues ?? [];
  const extra: string[] = [];
  if (photo && height && !measured?.measure && !issues.some((i) => BLOCKING.includes(i))) {
    extra.push("Body not measured");
  }
  if (error) extra.push(error);

  return (
    <div className="photo">
      <h3>{TITLE[view]}</h3>
      {busy ? (
        <div className="slot">Measuring…</div>
      ) : photo ? (
        <PhotoCanvas photo={photo} measure={measured?.measure ?? null} />
      ) : (
        <div className="slot">{TITLE[view]}</div>
      )}
      <IssueChips issues={issues} extra={extra} />
      <div className="actions">
        <button type="button" disabled={busy || !height} onClick={props.onRetake}>
          {photo ? "Retake" : "Camera"}
        </button>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          Upload
        </button>
        {photo && !busy && (
          <button type="button" onClick={props.onRemove}>
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) props.onUpload(f);
          }}
        />
      </div>
    </div>
  );
}

function BodyTable({ body }: { body: Body }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Measurement</th>
            <th className="num">cm</th>
            <th className="num">±</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {SHOWN.map((k) => {
            const e = body[k];
            return (
              <tr key={k}>
                <td>{BODY_LABEL[k]}</td>
                <td className={`num ${e ? "" : "muted"}`}>{e ? cm(e.value) : "—"}</td>
                <td className="num muted">{e ? `±${Math.round(2 * e.sd)}` : ""}</td>
                <td>
                  {e &&
                    (e.source === "typed" ? "Typed" : e.method === "joints" ? "Joints" : "Outline")}
                  {e?.photo !== undefined && (
                    <span className={`chip ${e.mismatch ? "" : "good"}`}> Photo {cm(e.photo)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FitCell({ d }: { d?: DimensionFit }) {
  return d?.verdict ? (
    <span className={`v-${d.verdict}`}>{verdictLabel(d.key, d.verdict)}</span>
  ) : (
    <span className="muted">—</span>
  );
}

function AreaChip({ d, side }: { d: DimensionFit; side: "tight" | "loose" }) {
  const text =
    d.verdict !== "good"
      ? verdictLabel(d.key, d.verdict!)
      : "Possibly " + verdictLabel(d.key, side === "tight" ? "snug" : "roomy").toLowerCase();
  const bad = d.verdict === "too_tight" || d.verdict === "too_loose";
  return (
    <span className={`chip ${bad ? "bad" : ""}`}>
      {GARMENT_LABEL[d.key]} · {text}
    </span>
  );
}

function FitResult({ rec }: { rec: Recommendation }) {
  const lines = limitations(rec);
  const best = rec.best;
  const limits = (
    <ul className="limits">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
  if (!best) {
    return (
      <>
        <div className="verdict">
          <span className="size muted">—</span>
        </div>
        {limits}
      </>
    );
  }
  const dim = (k: GarmentKey) => best.dims.find((d) => d.key === k)!;
  const keys = Object.keys(rec.garment.sizes[0].measurements) as GarmentKey[];
  const level = { high: "High", medium: "Medium", low: "Low" }[rec.level];

  return (
    <>
      <div className="verdict">
        <span className="size">{best.label}</span>
        {rec.alternative && <span className="muted">or {rec.alternative.label}</span>}
        <span className="confidence">
          Fit confidence <strong>{Math.round(rec.confidence * 100)}%</strong> · {level}
        </span>
      </div>
      <div className="chips">
        {rec.noGoodSize && <span className="chip bad">No size fits well</span>}
        {rec.tight.map((k) => (
          <AreaChip key={`t-${k}`} d={dim(k)} side="tight" />
        ))}
        {rec.loose.map((k) => (
          <AreaChip key={`l-${k}`} d={dim(k)} side="loose" />
        ))}
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>{best.label}</th>
              <th className="num">Body</th>
              <th className="num">Garment</th>
              <th className="num">Ease</th>
              <th>Fit</th>
            </tr>
          </thead>
          <tbody>
            {best.dims.map((d) => (
              <tr key={d.key}>
                <td>{GARMENT_LABEL[d.key]}</td>
                <td className="num">
                  {d.body ? (
                    <>
                      {cm(d.body.value)} <span className="muted">±{Math.round(2 * d.body.sd)}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">{cm(d.garment)}</td>
                <td className="num">{d.ease !== undefined ? signed(d.ease) : "—"}</td>
                <td>
                  <FitCell d={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Size</th>
              {keys.map((k) => (
                <th key={k}>{GARMENT_LABEL[k]}</th>
              ))}
              <th className="num">Fit</th>
            </tr>
          </thead>
          <tbody>
            {rec.sizes.map((s) => (
              <tr key={s.label} className={s === best ? "best" : ""}>
                <td>{s.label}</td>
                {keys.map((k) => (
                  <td key={k}>
                    <FitCell d={s.dims.find((d) => d.key === k)} />
                  </td>
                ))}
                <td className="num">
                  {Number.isFinite(s.penalty) ? `${Math.round(s.wearable * 100)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limits}
    </>
  );
}
