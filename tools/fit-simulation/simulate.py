"""Per-area garment tension on an archetype, per size (DEC-020).

Engines:
- `analytic` (seed, default): a strain model standing in for cloth simulation until Blender
  and factory patterns are available. Strain = (body − garment) / garment against the fabric's
  stretch capacity, slack lowers tension, and each motion adds its peak demand on the areas
  it loads (reaching loads shoulders and upper arms and lifts the hem; sitting loads waist,
  hips and thighs). The stored tension is the peak over the four motions.
- `blender`: blender_sim.py run headless (`blender -b -P blender_sim.py -- ...`); not yet
  wired, see README.

Tension is 0 (slack) to 1 (tight). Areas use the app's keys; the torso is shoulder to hip
line, so a top's length is compared with it plus the hem drop (src/lib/fit/config.ts).
"""

from __future__ import annotations

TORSO_HEM_DROP = 12  # keep equal to FIT.torsoHemDrop

MOTION_LOAD = {
    "WALK": {"chest": 0.02, "waist": 0.02, "shoulder": 0.03, "upperArm": 0.03},
    "RUN": {"chest": 0.05, "waist": 0.03, "shoulder": 0.06, "upperArm": 0.07, "thigh": 0.06},
    "REACH": {"shoulder": 0.14, "upperArm": 0.1, "chest": 0.06, "torso": 0.12},
    "SIT": {"waist": 0.1, "hip": 0.12, "thigh": 0.15, "torso": 0.05},
}


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def region_tension(region: str, garment_cm: float, body_cm: float, stretch_pct: float):
    """(tension, peak motion) for one area."""
    body = body_cm + (TORSO_HEM_DROP if region == "torso" else 0)
    strain = max(0.0, (body - garment_cm) / garment_cm)
    slack = max(0.0, (garment_cm - body) / garment_cm)
    capacity = (0 if region in ("torso", "shoulder") else stretch_pct / 100) + 0.02
    static = 0.42 + 0.58 * min(1.0, strain / capacity) - 2.0 * slack
    room = clamp(1 - 4 * slack, 0, 1)  # loose cloth barely feels motion
    motion, bump = max(((m, load.get(region, 0)) for m, load in MOTION_LOAD.items()),
                       key=lambda x: x[1])
    return round(clamp(static + bump * room, 0.05, 1.0), 3), motion


def tensions(garment: dict, archetype: dict, engine: str = "analytic") -> list[dict]:
    if engine == "blender":
        raise NotImplementedError("Blender cloth simulation is not wired yet; see README.")
    stretch = garment["fabric"]["stretch_pct"]
    rows = []
    for size, cells in garment["size_chart"].items():
        for region, cm in cells.items():
            body = archetype["params"].get(region)
            if body is None:
                continue
            t, motion = region_tension(region, cm, body, stretch)
            rows.append({"archetype": archetype["name"], "size": size, "region": region,
                         "base": t, "note": f"peak in {motion.lower()}" if t > 0.42 else ""})
    return rows
