# Body guide renders

The My measurements page (`/account/fit`) shows a rendered standard body with the measurement
rings drawn on it. The rings are real cross-sections of the body mesh, so they wrap it the way a
tape does: solid in front, faint behind.

Regenerate (Blender 4.5, about a minute per body; no downloads):

```sh
B="C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"
"$B" -b --factory-startup -P tools/body-guide/render.py -- public/fit-assets/bodies/men-10-95de7c0659.glb tmp/guide/men
"$B" -b --factory-startup -P tools/body-guide/render.py -- public/fit-assets/bodies/women-09-04d0d18727.glb tmp/guide/women
node tools/body-guide/build.mjs tmp/guide
```

`render.py` writes a clay-shaded PNG with a transparent background and the ring paths in image
pixels; `build.mjs` crops it, writes `public/fit-assets/guide/{men,women}.webp` and
`src/lib/fit/body-guide.json`. Bodies are lean, fit standard shapes (men 10: 175 cm, chest 98, waist 78; women 09: 161 cm,
chest 84, waist 65, hip 93) from
[fit-simulation](../fit-simulation/README.md).
