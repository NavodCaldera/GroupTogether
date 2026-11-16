"""Blender cloth settings from a product's fabric fields (DEC-021, Phase 6). Plain Python.

`mass` is the fabric's weight in kg per square metre (gsm / 1000); simulate.py spreads it over
the garment's vertices, because Blender's own `mass` is per vertex.
"""

from __future__ import annotations

DEFAULT_GSM = 160.0
DEFAULT_STRETCH_PCT = 5.0
_KNITS = ("knit", "jersey", "rib", "interlock", "fleece", "pique", "piqué", "terry", "spandex",
          "elastane", "lycra")


def is_knit(weave: str | None) -> bool:
    """Knits bend easily; anything not named as a knit is a woven. Unknown counts as a knit (a
    tee, the most common garment)."""
    if not weave:
        return True
    w = weave.lower()
    return any(k in w for k in _KNITS)


def stretch(stretch_pct: float | None) -> float:
    return DEFAULT_STRETCH_PCT if stretch_pct is None else max(0.0, float(stretch_pct))


def params(gsm: float | None, stretch_pct: float | None, weave: str | None) -> dict:
    tension = 15 / (1 + stretch(stretch_pct) / 10)
    return {
        "mass": (DEFAULT_GSM if gsm is None else float(gsm)) / 1000,
        "tension_stiffness": tension,
        "compression_stiffness": tension,
        "shear_stiffness": tension / 3,
        "bending_stiffness": 0.5 if is_knit(weave) else 5.0,
        "air_damping": 1.0,
    }


def capacity(stretch_pct: float | None) -> float:
    """Edge strain at which a region reads fully tight (tension 1)."""
    return stretch(stretch_pct) / 100 + 0.05
