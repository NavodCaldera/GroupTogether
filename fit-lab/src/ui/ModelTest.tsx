import { useRef, useState } from "react";
import {
  summarizeLive,
  summarizeStill,
  toCsv,
  type LiveRun,
  type LiveSummary,
  type StillRun,
  type StillSummary,
} from "../eval/compare";
import { BODY_LABEL } from "../labels";
import { positionPrompt } from "../live/guidance";
import type { BodyKey, View } from "../types";
import { analyzePhoto, toCanvas } from "../vision/analyze";
import { vision } from "../vision/client";
import type { Models, PoseModel } from "../vision/mediapipe";

const NAME: Record<PoseModel, string> = { lite: "Lite", full: "Full", heavy: "Heavy" };
const STILL_MODELS: PoseModel[] = ["full", "heavy"];
const LIVE_MODELS: PoseModel[] = ["lite", "full"];
const LIVE_WIDTH = 384;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const ms = (x: number | null) => (x === null ? "—" : `${Math.round(x)}`);
const jit = (x: number | null | undefined) => (x == null ? "—" : `${x.toFixed(2)}%`);
const signed = (x: number) => (x > 0 ? "+" : "") + x.toFixed(1);

interface Result {
  still: StillSummary[];
  live: LiveSummary[];
  csv: string;
}

export function ModelTest(props: {
  models: Models;
  onModels: (m: Models) => void;
  typed: Partial<Record<BodyKey, number>>;
}) {
  const { models, onModels, typed } = props;
  const [files, setFiles] = useState<Record<View, File[]>>({ front: [], side: [] });
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = { front: useRef<HTMLInputElement>(null), side: useRef<HTMLInputElement>(null) };
  const height = typed.height ?? 0;
  const count = files.front.length + files.side.length;

  async function run() {
    setError(null);
    setResult(null);
    const still: StillRun[] = [];
    const live: LiveRun[] = [];
    try {
      const images = await Promise.all(
        (["front", "side"] as const).flatMap((view) =>
          files[view].map(async (file) => {
            const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
            const canvas = toCanvas(bmp, bmp.width, bmp.height);
            bmp.close();
            return { view, file: file.name, canvas };
          }),
        ),
      );
      const total = images.length * (STILL_MODELS.length + LIVE_MODELS.length);
      let done = 0;
      // One untimed run per model first: start-up (shaders, graph) isn't processing time.
      const first = images[0];
      const liveFrame = async (img: (typeof images)[number]) => {
        const h = Math.round((img.canvas.height * LIVE_WIDTH) / img.canvas.width);
        const frame = await createImageBitmap(img.canvas, {
          resizeWidth: LIVE_WIDTH,
          resizeHeight: h,
        });
        return { frame, aspect: LIVE_WIDTH / h };
      };
      for (const model of STILL_MODELS) {
        setProgress(`${NAME[model]} · warming up`);
        await analyzePhoto(
          first.canvas,
          first.canvas.width,
          first.canvas.height,
          first.view,
          model,
        );
        for (const img of images) {
          setProgress(`${NAME[model]} · ${++done} / ${total}`);
          const a = await analyzePhoto(
            img.canvas,
            img.canvas.width,
            img.canvas.height,
            img.view,
            model,
          );
          still.push({
            model,
            view: img.view,
            file: img.file,
            landmarks: a.landmarks,
            mask: a.mask,
            issues: a.issues,
            ms: a.ms,
          });
        }
      }
      for (const model of LIVE_MODELS) {
        setProgress(`${NAME[model]} live · warming up`);
        await vision.live((await liveFrame(first)).frame, performance.now(), model);
        for (const img of images) {
          setProgress(`${NAME[model]} live · ${++done} / ${total}`);
          const { frame, aspect } = await liveFrame(img);
          const r = await vision.live(frame, performance.now(), model);
          const ok = positionPrompt(img.view, r.landmarks, r.people, aspect, r.turn) === null;
          live.push({ model, view: img.view, file: img.file, ms: r.ms, ok });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(null);
      return;
    }
    const stillS = STILL_MODELS.map((m) => summarizeStill(m, still, height, typed));
    const liveS = LIVE_MODELS.map((m) => summarizeLive(m, live));
    setResult({ still: stillS, live: liveS, csv: toCsv(navigator.userAgent, still, live, stillS) });
    setProgress(null);
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "fit-lab-models.csv",
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  const keys = result
    ? [...new Set(result.still.flatMap((s) => s.measures.map((m) => m.key)))]
    : [];

  return (
    <section>
      <h2>Models</h2>
      <div className="grid">
        <label>
          <span>Live</span>
          <select
            value={models.live}
            onChange={(e) => onModels({ ...models, live: e.target.value as PoseModel })}
          >
            {LIVE_MODELS.map((m) => (
              <option key={m} value={m}>
                {NAME[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Photos</span>
          <select
            value={models.still}
            onChange={(e) => onModels({ ...models, still: e.target.value as PoseModel })}
          >
            {STILL_MODELS.map((m) => (
              <option key={m} value={m}>
                {NAME[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="sub">Model test</h3>
      <div className="actions">
        {(["front", "side"] as const).map((view) => (
          <span key={view}>
            <button
              type="button"
              disabled={!!progress}
              onClick={() => inputs[view].current?.click()}
            >
              {view === "front" ? "Front" : "Side"} images ({files[view].length})
            </button>
            <input
              ref={inputs[view]}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = "";
                setFiles((f) => ({ ...f, [view]: list }));
              }}
            />
          </span>
        ))}
        <button
          type="button"
          className="primary"
          disabled={!count || !height || !!progress}
          onClick={() => void run()}
        >
          Run
        </button>
        {result && (
          <button type="button" onClick={download}>
            Download CSV
          </button>
        )}
      </div>
      {progress && <p className="muted">{progress}</p>}
      {error && (
        <div className="chips">
          <span className="chip bad">{error}</span>
        </div>
      )}

      {result && (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Photos</th>
                  <th className="num">Images</th>
                  <th className="num">Measured</th>
                  <th className="num">Pose ms</th>
                  <th className="num">Total ms</th>
                  <th className="num">Jitter front</th>
                  <th className="num">Jitter side</th>
                </tr>
              </thead>
              <tbody>
                {result.still.map((s) => (
                  <tr key={s.model}>
                    <td>{NAME[s.model]}</td>
                    <td className="num">{s.images}</td>
                    <td className="num">{pct(s.success)}</td>
                    <td className="num">{ms(s.poseMs)}</td>
                    <td className="num">{ms(s.totalMs)}</td>
                    <td className="num">{jit(s.jitter.front)}</td>
                    <td className="num">{jit(s.jitter.side)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {keys.length > 0 && (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th className="num">Tape</th>
                    {result.still.map((s) => (
                      <th key={s.model} className="num">
                        {NAME[s.model]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <td>{BODY_LABEL[k]}</td>
                      <td className="num">{typed[k] ?? "—"}</td>
                      {result.still.map((s) => {
                        const m = s.measures.find((x) => x.key === k);
                        return (
                          <td key={s.model} className="num">
                            {m ? (
                              <>
                                {m.mean.toFixed(1)}{" "}
                                <span className="muted">±{m.sd.toFixed(1)}</span>
                                {m.error !== null && <> · {signed(m.error)}</>}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Live</th>
                  <th className="num">Frames</th>
                  <th className="num">Pose ms</th>
                  <th className="num">Position OK</th>
                </tr>
              </thead>
              <tbody>
                {result.live.map((s) => (
                  <tr key={s.model}>
                    <td>{NAME[s.model]}</td>
                    <td className="num">{s.frames}</td>
                    <td className="num">{ms(s.ms)}</td>
                    <td className="num">{pct(s.ok)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
