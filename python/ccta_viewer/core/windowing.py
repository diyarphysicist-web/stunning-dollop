"""Window/Level transforms with cardiac CT presets.

Window/Level (also called window width/center, "WW/WL") maps a slice
of the Hounsfield Unit range onto the 0..255 display range. Every
clinical viewer keeps a small set of named presets — the values below
follow the conventions used in cardiac CT reading (e.g. Schoepf, ESCR
recommendations).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable

import numpy as np


@dataclass(frozen=True)
class WindowLevel:
    width: float
    center: float
    name: str = ""

    def lo_hi(self) -> tuple[float, float]:
        half = self.width / 2.0
        return (self.center - half, self.center + half)


CT_PRESETS: Dict[str, WindowLevel] = {
    "Cardiac":      WindowLevel(800,   200, "Cardiac"),
    "Coronary":     WindowLevel(700,   200, "Coronary"),
    "Angio":        WindowLevel(600,   100, "Angio"),
    "Mediastinum":  WindowLevel(350,    50, "Mediastinum"),
    "Soft Tissue":  WindowLevel(400,    40, "Soft Tissue"),
    "Lung":         WindowLevel(1500, -600, "Lung"),
    "Bone":         WindowLevel(2000,  300, "Bone"),
    "Brain":        WindowLevel(80,     40, "Brain"),
    "Calcium":      WindowLevel(800,   300, "Calcium"),
    "Liver":        WindowLevel(150,    60, "Liver"),
    "PE":           WindowLevel(700,   100, "PE"),
    "Stent":        WindowLevel(1500,  300, "Stent"),
    "Full Range":   WindowLevel(4000, 1000, "Full Range"),
}


def preset_names() -> Iterable[str]:
    return CT_PRESETS.keys()


def apply_window(
    image: np.ndarray,
    wl: WindowLevel,
    out_dtype: np.dtype = np.uint8,
) -> np.ndarray:
    """Apply a window/level transform.

    Returns an array in [0, 255] (uint8) by default. The transform is
    a hard linear ramp clamped at the window edges, matching the
    standard DICOM LINEAR VOI LUT.
    """
    lo, hi = wl.lo_hi()
    if hi <= lo:
        hi = lo + 1.0
    arr = image.astype(np.float32, copy=False)
    out = (arr - lo) / (hi - lo)
    np.clip(out, 0.0, 1.0, out=out)
    if out_dtype == np.uint8:
        return (out * 255.0).astype(np.uint8)
    if out_dtype == np.uint16:
        return (out * 65535.0).astype(np.uint16)
    return out.astype(out_dtype)


def auto_window(image: np.ndarray, percentiles: tuple[float, float] = (1, 99)) -> WindowLevel:
    """Estimate a reasonable window/level from image statistics."""
    lo, hi = np.percentile(image, percentiles)
    width = float(hi - lo) or 1.0
    center = float((hi + lo) / 2.0)
    return WindowLevel(width, center, name="Auto")
