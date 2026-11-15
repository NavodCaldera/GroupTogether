"""Per-area garment tension on an archetype, per size (DEC-020).

Engines:
- `analytic` (seed, default): stands in for cloth simulation until Blender and factory
  patterns are available. Rest tension follows the app's ideal-ease curve per garment type
  (src/lib/fit/config.ts), and each motion adds its peak demand on the areas it loads (reaching loads shoulders and upper arms and lifts the hem; sitting loads waist,
  hips and thighs). The stored tension is the peak over the four motions.
- `blender`: blender_sim.py run headless (`blender -b -P blender_sim.py -- ...`); not yet
  wired, see README.

Tension is 0 (slack) to 1 (tight). Areas use the app's keys; the torso is shoulder to hip
line, so a top's length is compared with it plus the hem drop (src/lib/fit/config.ts).
"""

from __future__ import annotations

TORSO_HEM_DROP = 12  # keep equal to FIT.torsoHemDrop
CENTRE, SNUG_AT_ZERO, COMFORTABLE_FROM, K = 0.4, 0.65, 0.2, 0.08  # FIT in src/lib/fit/config.ts
STRETCH_FACTOR, MIN_STRETCH_KEEP = 2.5, 0.1

# Ideal ease and loose distance (cm) per garment type and area: EASE in src/lib/fit/config.ts.
EASE = {
    "top": {"chest": (10, 16), "waist": (12, 18), "hip": (8, 14), "upperArm": (6, 10),
            "shoulder": (0, 4), "torso": (0, 10)},
    "outer": {"chest": (16, 16), "waist": (18, 18), "hip": (12, 14), "upperArm": (8, 10),
              "shoulder": (1, 5), "torso": (0, 10)},
    "bottom": {"waist": (2, 6), "hip": (6, 12), "thigh": (6, 10)},
    "dress": {"chest": (8, 14), "waist": (6, 14), "hip": (8, 16), "shoulder": (0, 4),
              "torso": (0, 10)},
}
LENGTHS = {"shoulder", "torso"}

MOTION_LOAD = {
    "WALK": {"chest": 0.02, "waist": 0.02, "shoulder": 0.03, "upperArm": 0.03},
    "RUN": {"chest": 0.05, "waist": 0.03, "shoulder": 0.06, "upperArm": 0.07, "thigh": 0.06},
    "REACH": {"shoulder": 0.08, "upperArm": 0.08, "chest": 0.05, "torso": 0.1},
    "SIT": {"waist": 0.1, "hip": 0.12, "thigh": 0.15, "torso": 0.05},
}


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def fit_class(kind: str) -> str:
    if any(w in kind for w in ("trousers", "jeans", "shorts", "skirts", "bottoms")):
        return "bottom"
    if "dresses" in kind:
        return "dress"
    return "outer" if "jackets" in kind else "top"


def static_tension(region: str, ease: float, stretch_pct: float, cls: str) -> float:
    """Tension at rest: the same curve as shift() in src/lib/fit/report.ts."""
    ideal, loose_at = EASE[cls].get(region) or EASE["top"].get(region) or (4, 10)
    if ease >= ideal:
        return CENTRE - (CENTRE - COMFORTABLE_FROM) * (ease - ideal) / loose_at
    zero = SNUG_AT_ZERO - CENTRE if ideal > 0 else 0
    if ease >= 0:
        return CENTRE + zero * (ideal - ease) / ideal
    relief = 1 if region in LENGTHS else max(MIN_STRETCH_KEEP, 1 - STRETCH_FACTOR * stretch_pct / 100)
    return CENTRE + zero + K * -ease * relief


def region_tension(region: str, garment_cm: float, body_cm: float, stretch_pct: float,
                   cls: str = "top"):
    """(tension, peak motion) for one area: rest tension plus the motion that loads it most."""
    body = body_cm + (TORSO_HEM_DROP if region == "torso" else 0)
    ease = garment_cm - body
    ideal, loose_at = EASE[cls].get(region) or EASE["top"].get(region) or (4, 10)
    # Motion pulls on cloth that has little room; at the ideal ease it is barely felt.
    room = clamp((ideal + 2 - ease) / (ideal + 2), 0, 1)
    motion, bump = max(((m, load.get(region, 0)) for m, load in MOTION_LOAD.items()),
                       key=lambda x: x[1])
    return round(clamp(static_tension(region, ease, stretch_pct, cls) + bump * room, 0.05, 1.0),
                 3), motion


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
            t, motion = region_tension(region, cm, body, stretch, fit_class(garment["kind"]))
            rows.append({"archetype": archetype["name"], "size": size, "region": region,
                         "base": t, "note": f"peak in {motion.lower()}" if t > 0.45 else ""})
    return rows
