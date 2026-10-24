const TIMERS = [0, 5, 10];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
) {
  return Object.assign(document.createElement(tag), props);
}

/** Full-screen camera with a body outline and a self-timer. Resolves with the frame, or null when closed. */
export function openCamera(): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    let facing: "user" | "environment" = "environment";
    let timer = 10;
    let stream: MediaStream | null = null;
    let counting = 0;

    const video = el("video", { autoplay: true, playsInline: true, muted: true });
    const count = el("div", { className: "count" });
    const view = el("div", { className: "view" });
    view.append(video, el("div", { className: "guide" }), count);

    const flip = el("button", { type: "button", textContent: "Flip" });
    const time = el("button", { type: "button", textContent: `Timer ${timer} s` });
    const shoot = el("button", { type: "button", className: "primary", textContent: "Capture" });
    const close = el("button", { type: "button", textContent: "Close" });
    const bar = el("div", { className: "bar" });
    bar.append(flip, time, shoot, close);

    const root = el("div", { className: "camera" });
    root.append(view, bar);
    document.body.append(root);

    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    const finish = (result: HTMLCanvasElement | null) => {
      window.clearInterval(counting);
      stop();
      root.remove();
      resolve(result);
    };

    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        video.srcObject = stream;
        video.style.transform = facing === "user" ? "scaleX(-1)" : "";
        shoot.disabled = false;
      } catch {
        shoot.disabled = true;
        count.style.fontSize = "20px";
        count.textContent = "No camera";
      }
    }

    function capture() {
      const canvas = el("canvas", { width: video.videoWidth, height: video.videoHeight });
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      finish(canvas);
    }

    flip.onclick = () => {
      facing = facing === "user" ? "environment" : "user";
      void start();
    };
    time.onclick = () => {
      timer = TIMERS[(TIMERS.indexOf(timer) + 1) % TIMERS.length];
      time.textContent = timer ? `Timer ${timer} s` : "Timer off";
    };
    shoot.onclick = () => {
      if (!video.videoWidth || counting) return;
      if (!timer) return capture();
      let left = timer;
      count.textContent = String(left);
      counting = window.setInterval(() => {
        left -= 1;
        count.textContent = left ? String(left) : "";
        if (!left) capture();
      }, 1000);
    };
    close.onclick = () => finish(null);

    void start();
  });
}
