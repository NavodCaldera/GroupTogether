/**
 * Small skinned glb files for browser tests (DEC-021): a capsule-ish column with the 36-bone
 * skeleton of tools/body-fitting/skin.py (translation-only bones, pure-translation inverse binds,
 * as tools/fit-simulation/gltf.py writes them). Each vertex follows its nearest bone.
 *
 *   skinnedGlb({ attribute: "_BODY_PART", bottom: 0, top: 1.7, radius: 0.15, value: (y) => part })
 */

export const BONES = [
  "root",
  "pelvis.L",
  "upperleg01.L",
  "upperleg02.L",
  "lowerleg01.L",
  "lowerleg02.L",
  "foot.L",
  "pelvis.R",
  "upperleg01.R",
  "upperleg02.R",
  "lowerleg01.R",
  "lowerleg02.R",
  "foot.R",
  "spine05",
  "spine04",
  "spine03",
  "spine02",
  "spine01",
  "clavicle.L",
  "shoulder01.L",
  "upperarm01.L",
  "upperarm02.L",
  "lowerarm01.L",
  "lowerarm02.L",
  "wrist.L",
  "clavicle.R",
  "shoulder01.R",
  "upperarm01.R",
  "upperarm02.R",
  "lowerarm01.R",
  "lowerarm02.R",
  "wrist.R",
  "neck01",
  "neck02",
  "neck03",
  "head",
];

// Height and distance from the middle of each bone's head, metres; then its parent.
const HEAD = {
  root: [1.0, 0, null],
  pelvis: [0.95, 0.08, "root"],
  upperleg01: [0.9, 0.1, "pelvis"],
  upperleg02: [0.7, 0.1, "upperleg01"],
  lowerleg01: [0.5, 0.1, "upperleg02"],
  lowerleg02: [0.3, 0.1, "lowerleg01"],
  foot: [0.08, 0.1, "lowerleg02"],
  spine05: [1.05, 0, "root"],
  spine04: [1.13, 0, "spine05"],
  spine03: [1.21, 0, "spine04"],
  spine02: [1.29, 0, "spine03"],
  spine01: [1.37, 0, "spine02"],
  clavicle: [1.42, 0.05, "spine01"],
  shoulder01: [1.43, 0.15, "clavicle"],
  upperarm01: [1.42, 0.19, "shoulder01"],
  upperarm02: [1.3, 0.2, "upperarm01"],
  lowerarm01: [1.15, 0.21, "upperarm02"],
  lowerarm02: [1.03, 0.21, "lowerarm01"],
  wrist: [0.9, 0.21, "lowerarm02"],
  neck01: [1.47, 0, "spine01"],
  neck02: [1.51, 0, "neck01"],
  neck03: [1.55, 0, "neck02"],
  head: [1.6, 0, "neck03"],
};

function skeleton() {
  const heads = BONES.map((name) => {
    const [base, side] = name.split(".");
    const [y, x] = HEAD[base];
    return [side === "R" ? -x : x, y, 0];
  });
  const parents = BONES.map((name) => {
    const [base, side] = name.split(".");
    const parent = HEAD[base][2];
    if (!parent) return -1;
    const left = BONES.indexOf(`${parent}.${side}`);
    return left >= 0 ? left : BONES.indexOf(parent);
  });
  return { heads, parents };
}

/** A closed column of rings; `value(y)` gives each vertex's scalar attribute. */
export function skinnedGlb({ attribute, bottom, top, radius, value, rings = 12, segments = 12 }) {
  const { heads, parents } = skeleton();
  const positions = [];
  const scalars = [];
  const joints = [];
  const weights = [];
  for (let r = 0; r < rings; r++) {
    const y = bottom + ((top - bottom) * r) / (rings - 1);
    for (let s = 0; s < segments; s++) {
      const a = (2 * Math.PI * s) / segments;
      const p = [radius * Math.cos(a), y, radius * Math.sin(a)];
      positions.push(...p);
      scalars.push(value(y));
      let best = 0;
      let bestD = Infinity;
      heads.forEach((h, j) => {
        const d = (h[0] - p[0]) ** 2 + (h[1] - p[1]) ** 2 + (h[2] - p[2]) ** 2;
        if (d < bestD) [best, bestD] = [j, d];
      });
      joints.push(best, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
  }
  const indices = [];
  for (let r = 0; r < rings - 1; r++)
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      indices.push(a, a + segments, b, b, a + segments, b + segments);
    }

  const chunks = [];
  let length = 0;
  const views = [];
  const accessors = [];
  const add = (bytes, accessor, target) => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) chunks.push(new Uint8Array(pad));
    length += pad;
    views.push({
      buffer: 0,
      byteOffset: length,
      byteLength: bytes.byteLength,
      ...(target ? { target } : {}),
    });
    chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    length += bytes.byteLength;
    accessors.push({ bufferView: views.length - 1, ...accessor });
    return accessors.length - 1;
  };
  const n = positions.length / 3;
  const lo = [0, 1, 2].map((k) => Math.min(...positions.filter((_, i) => i % 3 === k)));
  const hi = [0, 1, 2].map((k) => Math.max(...positions.filter((_, i) => i % 3 === k)));
  const attrs = {
    POSITION: add(
      new Float32Array(positions),
      { componentType: 5126, count: n, type: "VEC3", min: lo, max: hi },
      34962,
    ),
    [attribute]: add(
      new Float32Array(scalars),
      { componentType: 5126, count: n, type: "SCALAR" },
      34962,
    ),
    JOINTS_0: add(new Uint8Array(joints), { componentType: 5121, count: n, type: "VEC4" }, 34962),
    WEIGHTS_0: add(
      new Float32Array(weights),
      { componentType: 5126, count: n, type: "VEC4" },
      34962,
    ),
  };
  const index = add(
    new Uint16Array(indices),
    { componentType: 5123, count: indices.length, type: "SCALAR" },
    34963,
  );
  const inverse = new Float32Array(16 * heads.length);
  heads.forEach((h, j) => {
    inverse.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -h[1], -h[2], 1], 16 * j);
  });
  const inverseBind = add(inverse, { componentType: 5126, count: heads.length, type: "MAT4" });

  const bones = BONES.map((name, j) => {
    const p = parents[j];
    const offset = heads[j].map((v, k) => v - (p >= 0 ? heads[p][k] : 0));
    const kids = parents.flatMap((q, k) => (q === j ? [1 + k] : []));
    return { name, translation: offset, ...(kids.length ? { children: kids } : {}) };
  });
  const doc = {
    asset: { version: "2.0", generator: "groupbasket e2e fixture" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: "mesh", mesh: 0, skin: 0 }, ...bones],
    meshes: [{ name: "mesh", primitives: [{ attributes: attrs, indices: index, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: { baseColorFactor: [0.85, 0.83, 0.8, 1], metallicFactor: 0 },
        doubleSided: true,
      },
    ],
    skins: [{ joints: BONES.map((_, j) => 1 + j), inverseBindMatrices: inverseBind }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  };
  const bin = new Uint8Array(length + ((4 - (length % 4)) % 4));
  let at = 0;
  for (const c of chunks) {
    bin.set(c, at);
    at += c.byteLength;
  }
  doc.buffers[0].byteLength = bin.byteLength;
  let json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(json.byteLength + jsonPad).fill(0x20);
    padded.set(json);
    json = padded;
  }
  const out = new Uint8Array(12 + 8 + json.byteLength + 8 + bin.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(json, 20);
  view.setUint32(20 + json.byteLength, bin.byteLength, true);
  view.setUint32(24 + json.byteLength, 0x004e4942, true);
  out.set(bin, 28 + json.byteLength);
  return out;
}
