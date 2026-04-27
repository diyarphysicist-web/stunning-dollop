"""Coronary artery calcium scoring (Agatston / volume / mass).

Implements the standard Agatston score for cardiac CT calcium scans:
each connected lesion above a 130 HU threshold contributes
``area_mm2 * weight(peak_HU)`` to the total score, where the weight is
1, 2, 3 or 4 for peak HU ranges 130-199, 200-299, 300-399 and >=400.

The scorer accepts an optional per-territory mask (LM, LAD, LCx, RCA)
so the result is broken down per artery — exactly the way clinical
reports present it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np
from scipy.ndimage import label

from .volume import Volume

CALCIUM_THRESHOLD_HU = 130.0
MIN_LESION_AREA_MM2 = 1.0  # Agatston requires ≥ 3 connected pixels traditionally


def agatston_weight(peak_hu: float) -> int:
    if peak_hu < 130:
        return 0
    if peak_hu < 200:
        return 1
    if peak_hu < 300:
        return 2
    if peak_hu < 400:
        return 3
    return 4


@dataclass
class CalciumLesion:
    territory: str
    slice_index: int
    area_mm2: float
    peak_hu: float
    mean_hu: float
    volume_mm3: float
    mass_mg: float
    agatston: float
    centroid_zyx: tuple = (0.0, 0.0, 0.0)


@dataclass
class CalciumReport:
    lesions: List[CalciumLesion] = field(default_factory=list)

    def total_agatston(self) -> float:
        return float(sum(l.agatston for l in self.lesions))

    def total_volume_mm3(self) -> float:
        return float(sum(l.volume_mm3 for l in self.lesions))

    def total_mass_mg(self) -> float:
        return float(sum(l.mass_mg for l in self.lesions))

    def by_territory(self) -> Dict[str, Dict[str, float]]:
        out: Dict[str, Dict[str, float]] = {}
        for l in self.lesions:
            d = out.setdefault(l.territory, {"agatston": 0.0, "volume_mm3": 0.0, "mass_mg": 0.0})
            d["agatston"] += l.agatston
            d["volume_mm3"] += l.volume_mm3
            d["mass_mg"] += l.mass_mg
        return out

    def risk_category(self) -> str:
        s = self.total_agatston()
        if s == 0:
            return "Very low (0)"
        if s < 100:
            return "Mild (1-99)"
        if s < 400:
            return "Moderate (100-399)"
        if s < 1000:
            return "Severe (400-999)"
        return "Extensive (≥1000)"


class AgatstonScorer:
    """Compute calcium scores on a volume.

    Parameters
    ----------
    threshold_hu :
        HU threshold to define a calcium lesion. Standard is 130 HU.
    min_area_mm2 :
        Lesions smaller than this in-plane area are ignored (noise).
    calibration :
        Manufacturer-specific mass calibration factor in mg/mL HU.
        Default 0.78 corresponds to a typical 120 kVp protocol.
    """

    def __init__(
        self,
        threshold_hu: float = CALCIUM_THRESHOLD_HU,
        min_area_mm2: float = MIN_LESION_AREA_MM2,
        calibration: float = 0.78,
    ):
        self.threshold_hu = threshold_hu
        self.min_area_mm2 = min_area_mm2
        self.calibration = calibration

    def score(
        self,
        volume: Volume,
        territory_mask: Optional[np.ndarray] = None,
        territories: Optional[Dict[int, str]] = None,
    ) -> CalciumReport:
        hu = volume.to_hu()
        sz, sy, sx = volume.spacing
        pixel_area = sy * sx
        pixel_volume = sz * sy * sx
        report = CalciumReport()

        for z in range(hu.shape[0]):
            slc = hu[z]
            mask = slc >= self.threshold_hu
            if not mask.any():
                continue
            lab, n = label(mask)
            for lesion_id in range(1, n + 1):
                pix = lab == lesion_id
                area_mm2 = float(pix.sum() * pixel_area)
                if area_mm2 < self.min_area_mm2:
                    continue
                values = slc[pix]
                peak = float(values.max())
                mean = float(values.mean())
                weight = agatston_weight(peak)
                if weight == 0:
                    continue
                agat = area_mm2 * weight
                lesion_volume = float(pix.sum() * pixel_volume)
                lesion_mass = float(values.sum() * pixel_volume * self.calibration / 1000.0)
                ys, xs = np.where(pix)
                centroid = (float(z), float(ys.mean()), float(xs.mean()))
                if territory_mask is not None and territories is not None:
                    label_id = int(territory_mask[z, int(ys.mean()), int(xs.mean())])
                    territory = territories.get(label_id, "Unknown")
                else:
                    territory = "Total"
                report.lesions.append(
                    CalciumLesion(
                        territory=territory,
                        slice_index=z,
                        area_mm2=area_mm2,
                        peak_hu=peak,
                        mean_hu=mean,
                        volume_mm3=lesion_volume,
                        mass_mg=lesion_mass,
                        agatston=agat,
                        centroid_zyx=centroid,
                    )
                )
        return report
