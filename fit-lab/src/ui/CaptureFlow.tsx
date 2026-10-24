import { useEffect, useRef, useState } from "react";
import { PROMPT_TEXT, type Prompt } from "../live/guidance";
import { LiveSession } from "../live/session";
import { BLOCKING } from "../measure/quality";
import type { View } from "../types";
import { analyzePhoto, type PhotoAnalysis } from "../vision/analyze";
import { vision } from "../vision/client";
import type { LiveResult } from "../vision/engine";
import { measurePhoto, type Photos } from "./derive";
import { useCamera, useSpeech, type Facing } from "./hooks";
import { drawLive } from "./overlay";
import { IssueChips, PhotoCanvas } from "./PhotoCanvas";

/** Live frames are downscaled before analysis; the lite model's input is smaller still. */
const LIVE_WIDTH = 384;

const TITLE: Record<View, string> = { front: "Front", side: "Side" };
const CUES: Record<View, string[]> = {
  front: ["Fitted clothes", "Whole body in view, 2–3 m away", "Face the camera, arms slightly out"],
  side: ["Fitted clothes", "Whole body in view, 2–3 m away", "Turn to your side, arms down"],
};

type Phase = "intro" | "live" | "analysing" | "review" | "error";

interface Props {
  views: View[];
  height: number;
  photos: Photos;
  onAccept: (photo: PhotoAnalysis) => void;
  onClose: () => void;
}

export function CaptureFlow({ views, height, photos, onAccept, onClose }: Props) {
  const [step, setStep] = useState(0);
  const view = views[step];
  const [phase, setPhase] = useState<Phase>("intro");
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<Facing>("user");
  const [voice, setVoice] = useState(true);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [shot, setShot] = useState<PhotoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Photos>({});

  const { videoRef, status } = useCamera(cameraOn, facing);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const say = useSpeech(voice);
  const sayRef = useRef(say);
  sayRef.current = say;

  useEffect(() => {
    void vision.warm("live").catch(() => undefined);
    void vision.warm("still").catch(() => undefined);
    return () => {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
  }, []);

  // Capture mode: one careful pass on the chosen still frame.
  async function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    setPhase("analysing");
    try {
      setShot(await analyzePhoto(video, video.videoWidth, video.videoHeight, view));
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }
  const captureRef = useRef(capture);
  captureRef.current = capture;

  // Live mode: light feedback on each new frame, one frame in flight at a time.
  useEffect(() => {
    if (phase !== "live" || status !== "ready") return;
    const video = videoRef.current!;
    const canvas = overlayRef.current!;
    const session = new LiveSession(view);
    let stopped = false;
    let handle = 0;
    setPrompt(null);
    setCount(null);

    const next = () => {
      if (stopped) return;
      if ("requestVideoFrameCallback" in video) {
        handle = video.requestVideoFrameCallback(() => void tick());
      } else {
        handle = requestAnimationFrame(() => void tick());
      }
    };

    const handleResult = (r: LiveResult, vw: number, vh: number) => {
      const s = session.step(performance.now(), r.landmarks, r.people, vw / vh);
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      drawLive(canvas, r.landmarks, s.ok);
      // React skips re-rendering when the value is unchanged.
      setPrompt(s.prompt);
      setCount(s.count);
      if (s.announce) sayRef.current(PROMPT_TEXT[s.prompt], 0);
      if (s.capture) {
        stopped = true;
        void captureRef.current();
      }
    };

    const tick = async () => {
      if (stopped) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw) {
        try {
          const frame = await createImageBitmap(video, {
            resizeWidth: LIVE_WIDTH,
            resizeHeight: Math.round((vh * LIVE_WIDTH) / vw),
            resizeQuality: "low",
          });
          const r = await vision.live(frame, performance.now());
          if (stopped) return;
          handleResult(r, vw, vh);
        } catch (err) {
          if (stopped) return;
          setError(err instanceof Error ? err.message : String(err));
          setPhase("error");
          return;
        }
      }
      next();
    };

    next();
    return () => {
      stopped = true;
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(handle);
    };
  }, [phase, status, view, videoRef]);

  function start() {
    setCameraOn(true);
    setPhase("live");
  }

  function accept() {
    if (!shot) return;
    onAccept(shot);
    const done = { ...accepted, [shot.view]: shot };
    setAccepted(done);
    setShot(null);
    if (step + 1 < views.length) {
      setStep(step + 1);
      setPhase("intro");
    } else {
      onClose();
    }
  }

  const front = accepted.front ?? photos.front;
  const review = shot ? measurePhoto(shot, height, front) : null;
  const blocked = review?.issues.some((i) => BLOCKING.includes(i)) ?? false;
  const mirror = facing === "user" ? "mirror" : "";
  const cameraProblem = phase === "live" && (status === "blocked" || status === "unavailable");

  return (
    <div className="capture" role="dialog" aria-label="Capture">
      <div className="capture-head">
        <span>
          {TITLE[view]} · {step + 1} of {views.length}
        </span>
      </div>

      <div className="stage">
        <video
          ref={videoRef}
          className={mirror}
          playsInline
          muted
          autoPlay
          hidden={phase !== "live"}
        />
        <canvas ref={overlayRef} className={`overlay ${mirror}`} hidden={phase !== "live"} />

        {phase === "intro" && (
          <div className="intro">
            <Pictogram view={view} />
            <h2>{TITLE[view]} photo</h2>
            <ul>
              {CUES[view].map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {phase === "live" && !cameraProblem && (
          <div className={`prompt ${prompt === "capturing" ? "go" : ""}`} aria-live="polite">
            <span>
              {prompt ? PROMPT_TEXT[prompt] : status === "ready" ? "…" : "Starting camera…"}
            </span>
            {count !== null && <span className="count">{count}</span>}
          </div>
        )}
        {cameraProblem && (
          <div className="center">{status === "blocked" ? "Camera blocked" : "No camera"}</div>
        )}

        {phase === "analysing" && <div className="center">Measuring…</div>}

        {phase === "review" && shot && (
          <div className="review">
            <PhotoCanvas photo={shot} measure={review?.measure ?? null} />
            <IssueChips issues={review?.issues ?? []} />
          </div>
        )}

        {phase === "error" && <div className="center">{error}</div>}
      </div>

      <div className="bar">
        {phase === "intro" && (
          <>
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="button" className="primary" onClick={start}>
              Start
            </button>
          </>
        )}
        {phase === "live" && (
          <>
            <button
              type="button"
              onClick={() => setFacing(facing === "user" ? "environment" : "user")}
            >
              Flip
            </button>
            <button type="button" aria-pressed={voice} onClick={() => setVoice(!voice)}>
              Voice {voice ? "on" : "off"}
            </button>
            <button
              type="button"
              className="primary"
              disabled={status !== "ready"}
              onClick={() => void capture()}
            >
              Capture
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </>
        )}
        {phase === "review" && (
          <>
            <button type="button" onClick={() => setPhase("live")}>
              Retake
            </button>
            <button type="button" className="primary" disabled={blocked} onClick={accept}>
              Use photo
            </button>
          </>
        )}
        {phase === "error" && (
          <>
            <button type="button" onClick={onClose}>
              Close
            </button>
            <button type="button" className="primary" onClick={() => setPhase("live")}>
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Pictogram({ view }: { view: View }) {
  return (
    <svg className="pictogram" viewBox="0 0 60 120" aria-hidden="true">
      <circle cx="30" cy="12" r="8" />
      {view === "front" ? (
        <path d="M30 20v40M30 26l-16 26M30 26l16 26M30 60l-9 52M30 60l9 52" />
      ) : (
        <path d="M30 20v40M30 26l2 30M30 60l0 52M30 60l3 52" />
      )}
    </svg>
  );
}
