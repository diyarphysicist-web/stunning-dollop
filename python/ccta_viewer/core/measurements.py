"""Measurement primitives — distances, angles, ROI statistics.

The viewer stores measurements in voxel space; conversion to mm uses
the volume spacing so the same primitive can be drawn on any plane.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np

from .volume import Volume


@dataclass
class DistanceMeasurement:
    p1: Tuple[float, float, float]  # voxel zyx
    p2: Tuple[float, float, float]
    label: str = ""

    def length_mm(self, spacing: Tuple[float, float, float]) -> float:
        d = (np.asarray(self.p2) - np.asarray(self.p1)) * np.asarray(spacing)
        return float(np.linalg.norm(d))


@dataclass
class AngleMeasurement:
    a: Tuple[float, float, float]
    vertex: Tuple[float, float, float]
    b: Tuple[float, float, float]
    label: str = ""

    def angle_deg(self, spacing: Tuple[float, float, float]) -> float:
        s = np.asarray(spacing)
        u = (np.asarray(self.a) - np.asarray(self.vertex)) * s
        v = (np.asarray(self.b) - np.asarray(self.vertex)) * s
        nu = np.linalg.norm(u)
        nv = np.linalg.norm(v)
        if nu == 0 or nv == 0:
            return 0.0
        cosang = float(np.dot(u, v) / (nu * nv))
        cosang = max(-1.0, min(1.0, cosang))
        return float(np.degrees(np.arccos(cosang)))


@dataclass
class ROIStatistics:
    mean: float
    std: float
    min: float
    max: float
    area_mm2: float
    n_pixels: int


def compute_roi_stats(
    image: np.ndarray, mask: np.ndarray, spacing_mm: Tuple[float, float]
) -> ROIStatistics:
    if image.shape != mask.shape:
        raise ValueError("image and mask must have the same shape")
    pixels = image[mask.astype(bool)]
    if pixels.size == 0:
        return ROIStatistics(0.0, 0.0, 0.0, 0.0, 0.0, 0)
    pixel_area = float(spacing_mm[0] * spacing_mm[1])
    return ROIStatistics(
        mean=float(pixels.mean()),
        std=float(pixels.std()),
        min=float(pixels.min()),
        max=float(pixels.max()),
        area_mm2=float(pixels.size * pixel_area),
        n_pixels=int(pixels.size),
    )


def diameter_from_lumen(
    cross_section: np.ndarray,
    pixel_mm: float,
    threshold_hu: float = 150.0,
) -> Tuple[float, float, float]:
    """Estimate min, mean and max diameters of the brightest blob in a CPR cross-section.

    A coarse heuristic suitable for stenosis grading: threshold at
    ``threshold_hu`` (typical contrast lumen) and find the largest
    connected component, then measure max chord length and equivalent
    circular diameter.
    """
    from scipy.ndimage import label

    mask = cross_section >= threshold_hu
    if not mask.any():
        return (0.0, 0.0, 0.0)
    lab, n = label(mask)
    if n == 0:
        return (0.0, 0.0, 0.0)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    main = int(np.argmax(counts))
    blob = lab == main
    area = float(blob.sum()) * (pixel_mm ** 2)
    eq_d = 2.0 * np.sqrt(area / np.pi)
    ys, xs = np.where(blob)
    coords = np.column_stack([ys, xs]).astype(np.float64) * pixel_mm
    if coords.shape[0] >= 2:
        # Brute-force diameter via convex-hull-free bounding distances.
        c = coords.mean(axis=0)
        dists = np.linalg.norm(coords - c, axis=1)
        max_d = 2.0 * float(dists.max())
        min_d = 2.0 * float(dists.min()) if dists.size else max_d
    else:
        max_d = min_d = eq_d
    return (min_d, eq_d, max_d)
