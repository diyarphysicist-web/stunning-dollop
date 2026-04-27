"""Curved Planar Reformation (CPR).

Given a centerline through a vessel, build a 2D image whose vertical
axis corresponds to arc length along the vessel and whose horizontal
axis is a perpendicular cross-section. Two flavours:

* "stretched" CPR — each row is sampled along a single in-plane
  direction, producing a straightened view useful for stenosis
  assessment.
* "rotational" CPR — multiple stretched CPRs at different rotation
  angles around the centerline, producing a cine that lets the reader
  spin around the vessel.

A "cross-section" mode is also exposed: short slabs perpendicular to
the centerline, useful for diameter / area measurements.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from scipy.ndimage import map_coordinates

from .centerline import Centerline
from .volume import Volume


@dataclass
class CPRResult:
    image: np.ndarray
    spacing_mm: Tuple[float, float]  # (row, col)
    arc_length_mm: float
    width_mm: float


class CurvedPlanarReformatter:
    def __init__(self, volume: Volume):
        self.volume = volume

    def stretched_cpr(
        self,
        centerline: Centerline,
        width_mm: float = 30.0,
        pixel_mm: float = 0.3,
        rotation_deg: float = 0.0,
        order: int = 1,
    ) -> CPRResult:
        """Straightened CPR — rows = arc length, cols = perpendicular line.

        ``rotation_deg`` rotates the perpendicular sampling line around
        the local centerline tangent (use 0..180° to spin the view).
        """
        spacing = np.array(self.volume.spacing, dtype=np.float64)

        # Resample centerline to spacing of pixel_mm in arc length.
        cl = centerline
        arc_length = cl.length_mm(self.volume.spacing)
        n_rows = max(2, int(np.ceil(arc_length / pixel_mm)))
        cl = cl.resample(n_rows)
        tangents = cl.tangents

        n_cols = max(2, int(np.ceil(width_mm / pixel_mm)))
        offsets = (np.arange(n_cols) - n_cols / 2.0) * pixel_mm

        rot = np.deg2rad(rotation_deg)
        sin_r, cos_r = np.sin(rot), np.cos(rot)

        coords = np.empty((3, n_rows, n_cols), dtype=np.float64)
        for i in range(n_rows):
            t = tangents[i]
            u, v = _perp_basis(t)
            direction = u * cos_r + v * sin_r
            # convert mm direction -> voxel steps
            direction_vox = direction / spacing
            base = cl.points[i]
            coords[:, i, :] = base[:, None] + direction_vox[:, None] * offsets[None, :]

        sampled = map_coordinates(
            self.volume.array,
            coords.reshape(3, -1),
            order=order,
            mode="constant",
            cval=-1024,
        ).reshape(n_rows, n_cols)
        return CPRResult(
            image=sampled,
            spacing_mm=(pixel_mm, pixel_mm),
            arc_length_mm=arc_length,
            width_mm=width_mm,
        )

    def rotational_cpr(
        self,
        centerline: Centerline,
        n_angles: int = 36,
        width_mm: float = 30.0,
        pixel_mm: float = 0.3,
        order: int = 1,
    ) -> np.ndarray:
        """Stack of stretched CPRs spinning around the vessel.

        Returns an array of shape (n_angles, n_rows, n_cols).
        """
        frames = []
        for i in range(n_angles):
            angle = 180.0 * i / n_angles
            res = self.stretched_cpr(
                centerline, width_mm=width_mm, pixel_mm=pixel_mm,
                rotation_deg=angle, order=order,
            )
            frames.append(res.image)
        return np.stack(frames, axis=0)

    def cross_section(
        self,
        centerline: Centerline,
        index: int,
        size_mm: float = 20.0,
        pixel_mm: float = 0.2,
        order: int = 1,
    ) -> np.ndarray:
        """Perpendicular cross-section at centerline point ``index``.

        Used for vessel-diameter and lumen-area measurements.
        """
        spacing = np.array(self.volume.spacing, dtype=np.float64)
        index = int(np.clip(index, 0, centerline.n_points - 1))
        t = centerline.tangents[index]
        u, v = _perp_basis(t)

        n = max(2, int(np.ceil(size_mm / pixel_mm)))
        rr = (np.arange(n) - n / 2.0) * pixel_mm
        cc = (np.arange(n) - n / 2.0) * pixel_mm
        ii, jj = np.meshgrid(rr, cc, indexing="ij")
        u_vox = u / spacing
        v_vox = v / spacing
        base = centerline.points[index]
        coords = (
            base[:, None, None]
            + u_vox[:, None, None] * ii[None, :, :]
            + v_vox[:, None, None] * jj[None, :, :]
        )
        return map_coordinates(
            self.volume.array,
            coords.reshape(3, -1),
            order=order,
            mode="constant",
            cval=-1024,
        ).reshape(n, n)


def _perp_basis(tangent: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """Two unit vectors perpendicular to ``tangent`` (in physical mm space)."""
    t = np.asarray(tangent, dtype=np.float64)
    norm = np.linalg.norm(t) or 1.0
    t = t / norm
    helper = np.array([0.0, 0.0, 1.0]) if abs(t[0]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(t, helper)
    u /= np.linalg.norm(u) or 1.0
    v = np.cross(t, u)
    return u, v
