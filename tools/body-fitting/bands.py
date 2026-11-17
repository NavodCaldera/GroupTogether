"""Where a tape goes round the waist and the hip, as a size chart means them (plain numpy).

Rows are fractions of the way from the shoulder joints (0) to the hip joints (1). The waist is
the narrowest row in WAIST_BAND, the hip the widest row in HIP_BAND (around the hip line), both
by front width, taped every GIRTH_STEP. body.py `features` measures a buyer's body and the
standard bodies (tools/fit-simulation/clusters.py) with these; the cloth simulation
(tools/cloth-sim/garment.py `girth`) tapes its body file with them too.
"""

from __future__ import annotations

import numpy as np

WAIST_BAND = (0.45, 0.8)
HIP_BAND = (-0.1, 0.25)  # around the hip line
GIRTH_STEP = 0.025


def rows(region: str) -> np.ndarray:
    """The rows a tape is tried at for `region` ("waist" or "hip")."""
    lo, hi = WAIST_BAND if region == "waist" else (1 + HIP_BAND[0], 1 + HIP_BAND[1])
    return np.arange(lo, hi + 1e-9, GIRTH_STEP)
