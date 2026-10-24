import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "off" | "starting" | "ready" | "blocked" | "unavailable";
export type Facing = "user" | "environment";

/** The local camera via getUserMedia; no WebRTC connection is involved. */
export function useCamera(active: boolean, facing: Facing) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("off");

  useEffect(() => {
    if (!active) {
      setStatus("off");
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus("starting");
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current!;
        video.srcObject = s;
        video.onloadeddata = () => !cancelled && setStatus("ready");
        void video.play().catch(() => undefined);
      })
      .catch((err: DOMException) =>
        setStatus(err.name === "NotAllowedError" ? "blocked" : "unavailable"),
      );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, facing]);

  return { videoRef, status };
}

/** Spoken prompts, so a person standing away from the phone can follow them. */
export function useSpeech(enabled: boolean) {
  const last = useRef({ text: "", at: 0 });
  useEffect(() => {
    if (!enabled && "speechSynthesis" in window) speechSynthesis.cancel();
  }, [enabled]);
  return useCallback(
    (text: string, repeatAfterMs = 6000) => {
      if (!enabled || !("speechSynthesis" in window)) return;
      const now = performance.now();
      if (text === last.current.text && now - last.current.at < repeatAfterMs) return;
      speechSynthesis.cancel();
      speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      last.current = { text, at: now };
    },
    [enabled],
  );
}

/** Per-viewer convenience storage; the app works without it. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Not essential.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
