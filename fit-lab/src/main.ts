import "./styles.css";
import { limitations } from "./fit/limitations";
import { recommend, type DimensionFit, type Recommendation } from "./fit/predict";
import { GARMENTS, type GarmentKey } from "./garments/database";
import { BODY_LABEL, GARMENT_LABEL, verdictLabel } from "./labels";
import {
  estimateBody,
  measureFront,
  measureSide,
  type FrontMeasure,
  type SideMeasure,
} from "./measure/estimate";
import { BLOCKING, ISSUE_LABEL } from "./measure/quality";
import type { Body, BodyKey, Issue, View } from "./types";
import { openCamera } from "./ui/camera";
import { drawAnalysis } from "./ui/overlay";
import { analyzePhoto, type PhotoAnalysis } from "./vision/analyze";

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
const VIEWS: { view: View; title: string }[] = [
  { view: "front", title: "Front" },
  { view: "side", title: "Side" },
];
const STORE = "fit-lab";

interface State {
  typed: Partial<Record<BodyKey, number>>;
  garmentId: string;
  photos: Partial<Record<View, PhotoAnalysis>>;
  busy: Partial<Record<View, boolean>>;
  errors: Partial<Record<View, string>>;
}

const state: State = { typed: {}, garmentId: GARMENTS[0].id, photos: {}, busy: {}, errors: {} };

try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<State>;
  if (saved.typed) state.typed = saved.typed;
  if (saved.garmentId && GARMENTS.some((g) => g.id === saved.garmentId))
    state.garmentId = saved.garmentId;
} catch {
  // Storage unavailable; start empty.
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ typed: state.typed, garmentId: state.garmentId }));
  } catch {
    // Not essential.
  }
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const cm = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const signed = (n: number) => (n > 0 ? "+" : "") + cm(n);

// You

function renderForm() {
  const form = $<HTMLFormElement>("#measurements");
  form.innerHTML = TYPED.map(
    (
      k,
    ) => `<label><span>${BODY_LABEL[k]} (cm)${k === "height" ? ' <span class="req">*</span>' : ""}</span>
      <input type="number" inputmode="decimal" min="0" step="0.5" name="${k}" ${k === "height" ? "required" : ""}
        value="${state.typed[k] ?? ""}" /></label>`,
  ).join("");
  form.addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const v = parseFloat(input.value);
    const key = input.name as BodyKey;
    if (v > 0) state.typed[key] = v;
    else delete state.typed[key];
    save();
    update();
  });
  form.addEventListener("submit", (e) => e.preventDefault());
}

// Photos

async function takePhoto(
  view: View,
  source: () => Promise<{ img: CanvasImageSource; w: number; h: number } | null>,
) {
  const got = await source();
  if (!got) return;
  state.busy[view] = true;
  delete state.errors[view];
  renderPhoto(view, null);
  try {
    state.photos[view] = await analyzePhoto(got.img, got.w, got.h, view);
  } catch (err) {
    state.errors[view] = err instanceof Error ? err.message : String(err);
  } finally {
    state.busy[view] = false;
    update();
  }
}

function fromCamera() {
  return openCamera().then((c) => (c ? { img: c, w: c.width, h: c.height } : null));
}

function fromFile(file: File) {
  return async () => {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { img: bmp, w: bmp.width, h: bmp.height };
  };
}

function renderPhoto(view: View, measure: FrontMeasure | SideMeasure | null, issues: Issue[] = []) {
  const box = $(`.photo[data-view="${view}"]`);
  const photo = state.photos[view];
  const busy = state.busy[view];
  const title = VIEWS.find((v) => v.view === view)!.title;

  box.innerHTML = `<h3>${title}</h3>`;
  if (busy) {
    box.insertAdjacentHTML("beforeend", `<div class="slot">Analysing…</div>`);
  } else if (photo) {
    box.append(drawAnalysis(photo, measure));
  } else {
    box.insertAdjacentHTML("beforeend", `<div class="slot">${title}</div>`);
  }

  const chips = issues.map(
    (i) => `<span class="chip ${BLOCKING.includes(i) ? "bad" : ""}">${ISSUE_LABEL[i]}</span>`,
  );
  if (
    photo &&
    !busy &&
    !measure &&
    !issues.some((i) => BLOCKING.includes(i)) &&
    state.typed.height
  ) {
    chips.push(`<span class="chip bad">Body not measured</span>`);
  }
  if (state.errors[view]) chips.push(`<span class="chip bad">${esc(state.errors[view]!)}</span>`);
  if (chips.length)
    box.insertAdjacentHTML("beforeend", `<div class="chips">${chips.join("")}</div>`);

  const actions = document.createElement("div");
  actions.className = "actions";
  const camera = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Camera",
    disabled: !!busy,
  });
  camera.className = "primary";
  camera.onclick = () => void takePhoto(view, fromCamera);
  const file = Object.assign(document.createElement("input"), {
    type: "file",
    accept: "image/*",
    hidden: true,
  });
  file.onchange = () => file.files?.[0] && void takePhoto(view, fromFile(file.files[0]));
  const upload = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Upload",
    disabled: !!busy,
  });
  upload.onclick = () => file.click();
  actions.append(camera, upload, file);
  if (photo && !busy) {
    const remove = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: "Remove",
    });
    remove.onclick = () => {
      delete state.photos[view];
      update();
    };
    actions.append(remove);
  }
  box.append(actions);
}

// Body

function renderBody(body: Body) {
  const rows = SHOWN.map((k) => {
    const e = body[k];
    if (!e)
      return `<tr><td>${BODY_LABEL[k]}</td><td class="num muted">—</td><td></td><td></td></tr>`;
    const source = e.source === "typed" ? "Typed" : "Photo";
    const photo =
      e.photo !== undefined
        ? ` <span class="chip ${e.mismatch ? "" : "good"}">Photo ${cm(e.photo)}</span>`
        : "";
    return `<tr><td>${BODY_LABEL[k]}</td><td class="num">${cm(e.value)}</td>
      <td class="num muted">±${Math.round(2 * e.sd)}</td><td>${source}${photo}</td></tr>`;
  });
  $("#body").innerHTML = `<div class="scroll"><table>
    <thead><tr><th>Measurement</th><th class="num">cm</th><th class="num">±</th><th>Source</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table></div>`;
}

// Fit

function renderGarments() {
  const select = $<HTMLSelectElement>("#garment");
  select.innerHTML = GARMENTS.map(
    (g) => `<option value="${g.id}">${esc(g.name)} · ${g.fit} · ${esc(g.fabric.name)}</option>`,
  ).join("");
  select.value = state.garmentId;
  select.onchange = () => {
    state.garmentId = select.value;
    save();
    update();
  };
}

const fitCell = (d: DimensionFit | undefined) =>
  d?.verdict
    ? `<span class="v-${d.verdict}">${verdictLabel(d.key, d.verdict)}</span>`
    : `<span class="muted">—</span>`;

function areaChip(d: DimensionFit, side: "tight" | "loose") {
  const off = d.verdict !== "good";
  const text = off
    ? verdictLabel(d.key, d.verdict!)
    : verdictLabel(d.key, side === "tight" ? "snug" : "roomy").replace(
        /^./,
        (c) => "Possibly " + c.toLowerCase(),
      );
  const cls = d.verdict === "too_tight" || d.verdict === "too_loose" ? "bad" : "";
  return `<span class="chip ${cls}">${GARMENT_LABEL[d.key]} · ${text}</span>`;
}

function renderResult(rec: Recommendation) {
  const lines = limitations(rec)
    .map((l) => `<li>${esc(l)}</li>`)
    .join("");
  const best = rec.best;
  if (!best) {
    $("#result").innerHTML =
      `<div class="verdict"><span class="size muted">—</span></div><ul class="limits">${lines}</ul>`;
    return;
  }
  const dim = (k: GarmentKey) => best.dims.find((d) => d.key === k)!;
  const pct = Math.round(rec.confidence * 100);
  const level = { high: "High", medium: "Medium", low: "Low" }[rec.level];
  const chips = [
    ...(rec.noGoodSize ? [`<span class="chip bad">No size fits well</span>`] : []),
    ...rec.tight.map((k) => areaChip(dim(k), "tight")),
    ...rec.loose.map((k) => areaChip(dim(k), "loose")),
  ];

  const detail = best.dims
    .map((d) => {
      const body = d.body
        ? `${cm(d.body.value)} <span class="muted">±${Math.round(2 * d.body.sd)}</span>`
        : "—";
      return `<tr><td>${GARMENT_LABEL[d.key]}</td><td class="num">${body}</td><td class="num">${cm(d.garment)}</td>
        <td class="num">${d.ease !== undefined ? signed(d.ease) : "—"}</td><td>${fitCell(d)}</td></tr>`;
    })
    .join("");

  const keys = Object.keys(rec.garment.sizes[0].measurements) as GarmentKey[];
  const sizes = rec.sizes
    .map(
      (s) => `<tr class="${s === best ? "best" : ""}"><td>${esc(s.label)}</td>
        ${keys.map((k) => `<td>${fitCell(s.dims.find((d) => d.key === k))}</td>`).join("")}
        <td class="num">${Number.isFinite(s.penalty) ? Math.round(s.wearable * 100) + "%" : "—"}</td></tr>`,
    )
    .join("");

  $("#result").innerHTML = `
    <div class="verdict">
      <span class="size">${esc(best.label)}</span>
      ${rec.alternative ? `<span class="muted">or ${esc(rec.alternative.label)}</span>` : ""}
      <span class="confidence">Fit confidence <strong>${pct}%</strong> · ${level}</span>
    </div>
    ${chips.length ? `<div class="chips">${chips.join("")}</div>` : ""}
    <div class="scroll"><table>
      <thead><tr><th>${esc(best.label)}</th><th class="num">Body</th><th class="num">Garment</th><th class="num">Ease</th><th>Fit</th></tr></thead>
      <tbody>${detail}</tbody></table></div>
    <div class="scroll"><table>
      <thead><tr><th>Size</th>${keys.map((k) => `<th>${GARMENT_LABEL[k]}</th>`).join("")}<th class="num">Fit</th></tr></thead>
      <tbody>${sizes}</tbody></table></div>
    <ul class="limits">${lines}</ul>`;
}

// Pipeline: photos -> measurements -> body -> fit

function usable(p: PhotoAnalysis | undefined): p is PhotoAnalysis {
  return !!p && !p.issues.some((i) => BLOCKING.includes(i));
}

function update() {
  const height = state.typed.height ?? 0;
  const front = state.photos.front;
  const side = state.photos.side;

  const fm = height && usable(front) ? measureFront(front, height) : null;
  const sm = height && usable(side) ? measureSide(side, height, fm?.waistAt ?? null) : null;
  const frontIssues: Issue[] = [
    ...(front?.issues ?? []),
    ...(fm?.armsTouching ? (["arms_touching"] as Issue[]) : []),
  ];

  if (!state.busy.front) renderPhoto("front", fm, frontIssues);
  if (!state.busy.side) renderPhoto("side", sm, side?.issues ?? []);

  const body = estimateBody({
    heightCm: height,
    typed: state.typed,
    front: fm ? { measure: fm, issues: frontIssues } : null,
    side: sm ? { measure: sm, issues: side!.issues } : null,
  });
  if (!height) delete body.height;
  renderBody(body);

  const garment = GARMENTS.find((g) => g.id === state.garmentId)!;
  renderResult(recommend(garment, body));
}

renderForm();
renderGarments();
update();
