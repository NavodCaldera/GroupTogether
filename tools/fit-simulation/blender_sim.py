"""Blender headless cloth simulation: the production engine (DEC-020). NOT WIRED YET.

Run inside Blender (GPL, separate process, never linked into the app):

    blender -b -P tools/fit-simulation/blender_sim.py -- GARMENT.json ARCHETYPE.json OUT_DIR

Planned steps, once factory patterns exist:

1. Build the archetype body from its measurements (mesh.py's generator, or MakeHuman run as an
   isolated AGPL build step); add it as a Collision object.
2. Import the factory's 2D pattern pieces (DXF/SVG, per size), place them around the body and
   join them with sewing edges; add a Cloth modifier with the fabric's stretch, bend and shear
   stiffness and mass (gsm), and shrink the sewing springs to close the seams.
3. Paint the area vertex groups from the pattern piece ids (front/back panel bands → chest,
   waist, hip; sleeve → upper arm; yoke → shoulder; hem band → length; collar → neutral) and
   store them as the `_REGION_ID` attribute (0-6, 255 neutral).
4. For each motion (walk, run, reach, sit) retarget the clip onto the body armature, bake the
   cloth cache, and read per-area strain from edge lengths against rest lengths; tension =
   peak 95th-percentile strain over the clip divided by the fabric's stretch capacity, clamped
   to 0-1. Repeat for every size in the chart.
5. Export the garment and body per motion as glTF with the animation baked to morph targets or
   a skinned mesh, keep `_REGION_ID`, then Draco-compress (`gltf-transform draco`).
6. Write the same manifest.json layout as pipeline.py so load.ts works unchanged.

XRTailor (Apache 2.0) is the alternative engine for step 4 when batches grow.
"""

import sys

if __name__ == "__main__":
    sys.exit("blender_sim.py is a documented plan; use pipeline.py --engine analytic for now.")
