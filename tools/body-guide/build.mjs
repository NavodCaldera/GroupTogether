// Turns the Blender renders (tools/body-guide/render.py) into the app's body guide:
//   node tools/body-guide/build.mjs tmp/guide
// writes public/fit-assets/guide/{men,women}.webp and src/lib/fit/body-guide.json.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node tools/body-guide/build.mjs <render dir>");

/** "M a L b M b L c" pieces chained into one continuous path where ends meet. */
function chain(d) {
  const segs = [...d.matchAll(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/g)].map((m) => [
    `${m[1]} ${m[2]}`,
    `${m[3]} ${m[4]}`,
  ]);
  if (segs.length === 0) return d;
  const runs = [];
  for (const [a, b] of segs) {
    const run = runs.at(-1);
    if (run && run.at(-1) === a) run.push(b);
    else runs.push([a, b]);
  }
  // A ring split across the start of the loop: join the last run onto the first.
  if (runs.length > 1 && runs.at(-1).at(-1) === runs[0][0])
    runs[0] = [...runs.pop(), ...runs[0].slice(1)];
  return runs
    .map(
      (r) =>
        `M${r[0]}` +
        r
          .slice(1)
          .map((p) => `L${p}`)
          .join(""),
    )
    .join("");
}

const out = {};
fs.mkdirSync("public/fit-assets/guide", { recursive: true });
for (const g of ["men", "women"]) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, `${g}.json`), "utf8"));
  // Crop the empty margin around the body (keeping PAD px) and move the marks with it.
  const PAD = 16;
  const trimmed = await sharp(path.join(dir, `${g}.png`))
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  const left = -trimmed.info.trimOffsetLeft - PAD;
  const top = -trimmed.info.trimOffsetTop - PAD;
  const width = trimmed.info.width + 2 * PAD;
  const height = trimmed.info.height + 2 * PAD;
  const info = await sharp(trimmed.data)
    .extend({
      top: PAD,
      bottom: PAD,
      left: PAD,
      right: PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(`public/fit-assets/guide/${g}.webp`);
  const shift = (d) =>
    d.replace(
      /([ML])([\d.-]+) ([\d.-]+)/g,
      (_, c, x, y) =>
        `${c}${Math.round((+x - left) * 10) / 10} ${Math.round((+y - top) * 10) / 10}`,
    );
  const marks = {};
  for (const [k, m] of Object.entries(j.marks))
    marks[k] = { front: shift(chain(m.front)), back: m.back ? shift(chain(m.back)) : "" };
  out[g] = { width, height, marks };
  console.log(g, `${Math.round(info.size / 1024)} KB`);
}
fs.writeFileSync("src/lib/fit/body-guide.json", JSON.stringify(out));
