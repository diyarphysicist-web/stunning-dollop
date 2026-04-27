"""Multi-Planar Reconstruction (MPR).

Two flavours are provided:

* :class:`MPRSlicer` — orthogonal axial / sagittal / coronal slicing,
  fast because it indexes the volume directly.
* :class:`ObliqueSlicer` — arbitrary plane sampling via trilinear
  interpolation; used for the double-oblique reformats common in
  cardiac CT (short-axis, 2/3/4 chamber views, etc.).

Both produce 2D arrays whose pixels are isotropic in millimetres so a
display widget can paint them with a square aspect ratio.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Tuple

import numpy as np
from scipy.ndimage import map_coordinates

from .volume import Volume


class Plane(str, Enum):
    AXIAL = "axial"
    SAGITTAL = "sagittal"
    CORONAL = "coronal"


@dataclass
class Slice2D:
    image: np.ndarray
    spacing: Tuple[float, float]  # (row, col) in mm
    plane: str
    index: int = 0

    @property
    def aspect(self) -> float:
        rs, cs = self.spacing
        return float(rs / cs) if cs else 1.0


class MPRSlicer:
    """Orthogonal MPR.

    Indexing rules:
      * ``axial``    — slice along z, returns (Y, X), spacing (sy, sx)
      * ``coronal``  — slice along y, returns (Z, X), spacing (sz, sx)
      * ``sagittal`` — slice along x, returns (Z, Y), spacing (sz, sy)
    """

    def __init__(self, volume: Volume):
        self.volume = volume

    def slice(self, plane: str, index: int) -> Slice2D:
        plane = plane.lower()
        sz, sy, sx = self.volume.spacing
        a = self.volume.array
        nz, ny, nx = a.shape
        if plane == Plane.AXIAL.value:
            i = int(np.clip(index, 0, nz - 1))
            return Slice2D(a[i, :, :].copy(), (sy, sx), plane, i)
        if plane == Plane.CORONAL.value:
            i = int(np.clip(index, 0, ny - 1))
            return Slice2D(a[:, i, :].copy(), (sz, sx), plane, i)
        if plane == Plane.SAGITTAL.value:
            i = int(np.clip(index, 0, nx - 1))
            return Slice2D(a[:, :, i].copy(), (sz, sy), plane, i)
        raise ValueError(f"Unknown plane: {plane}")

    def thick_slab(
        self, plane: str, index: int, thickness_mm: float, mode: str = "max"
    ) -> Slice2D:
        """Slab projection through ``thickness_mm`` of tissue."""
        plane = plane.lower()
        sz, sy, sx = self.volume.spacing
        if plane == Plane.AXIAL.value:
            step = sz
            axis = 0
        elif plane == Plane.CORONAL.value:
            step = sy
            axis = 1
        elif plane == Plane.SAGITTAL.value:
            step = sx
            axis = 2
        else:
            raise ValueError(f"Unknown plane: {plane}")

        half = max(1, int(round(thickness_mm / step / 2)))
        a = self.volume.array
        size = a.shape[axis]
        lo = max(0, index - half)
        hi = min(size, index + half + 1)
        sub = np.take(a, range(lo, hi), axis=axis)
        if mode == "max":
            proj = sub.max(axis=axis)
        elif mode == "min":
            proj = sub.min(axis=axis)
        elif mode == "mean":
            proj = sub.mean(axis=axis).astype(a.dtype)
        else:
            raise ValueError(f"Unknown projection mode: {mode}")

        if axis == 0:
            spacing = (sy, sx)
        elif axis == 1:
            spacing = (sz, sx)
        else:
            spacing = (sz, sy)
        return Slice2D(proj, spacing, plane, index)


class ObliqueSlicer:
    """Sample an arbitrary oriented plane through the volume.

    The plane is parameterised by:
      * ``center`` — point in voxel coords (z, y, x) the plane passes through
      * ``u`` — in-plane row direction (unit vector in voxel space)
      * ``v`` — in-plane col direction (unit vector in voxel space)
      * ``size`` — output (rows, cols) in pixels
      * ``pixel_mm`` — desired isotropic pixel size of the reformat

    Output is a 2D image with isotropic spacing of ``pixel_mm``.
    """

    def __init__(self, volume: Volume):
        self.volume = volume

    def sample(
        self,
        center: Tuple[float, float, float],
        u: Tuple[float, float, float],
        v: Tuple[float, float, float],
        size: Tuple[int, int] = (512, 512),
        pixel_mm: float = 0.5,
        order: int = 1,
    ) -> Slice2D:
        sz, sy, sx = self.volume.spacing
        spacing_zyx = np.array([sz, sy, sx], dtype=np.float64)
        u_arr = np.asarray(u, dtype=np.float64)
        v_arr = np.asarray(v, dtype=np.float64)
        # Convert direction vectors from physical mm to voxel steps so
        # that a step of `pixel_mm` along u/v is correctly scaled.
        u_vox = (u_arr * pixel_mm) / spacing_zyx
        v_vox = (v_arr * pixel_mm) / spacing_zyx

        rows, cols = size
        rr = np.arange(rows) - rows / 2.0
        cc = np.arange(cols) - cols / 2.0
        ii, jj = np.meshgrid(rr, cc, indexing="ij")

        center_arr = np.asarray(center, dtype=np.float64)
        coords = (
            center_arr[:, None, None]
            + u_vox[:, None, None] * ii[None, :, :]
            + v_vox[:, None, None] * jj[None, :, :]
        )
        sampled = map_coordinates(
            self.volume.array,
            coords.reshape(3, -1),
            order=order,
            mode="constant",
            cval=-1024,
        ).reshape(rows, cols)
        return Slice2D(sampled, (pixel_mm, pixel_mm), "oblique")


def short_axis_basis(long_axis: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Build an orthonormal (u, v, n) frame whose normal is ``long_axis``.

    Useful for cardiac short-axis reformats where the operator picks
    the LV long axis and the viewer needs two perpendicular in-plane
    vectors.
    """
    n = np.asarray(long_axis, dtype=np.float64)
    n /= np.linalg.norm(n) or 1.0
    helper = np.array([0.0, 0.0, 1.0]) if abs(n[0]) > 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(n, helper)
    u /= np.linalg.norm(u) or 1.0
    v = np.cross(n, u)
    return u, v, n
