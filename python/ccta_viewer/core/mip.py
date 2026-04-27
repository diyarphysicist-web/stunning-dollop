"""Slab projections — MIP, MinIP, AvgIP.

These are the bread and butter of CTA reading: a thin slab of voxels
collapsed into a single 2D image. MIP highlights vessels (high HU);
MinIP highlights airway lumen; AvgIP smooths noise for soft-tissue
review.
"""

from __future__ import annotations

from enum import Enum
from typing import Tuple

import numpy as np

from .volume import Volume


class ProjectionMode(str, Enum):
    MIP = "mip"
    MIN = "minip"
    MEAN = "avgip"
    SUM = "sumip"


def slab_projection(
    volume: Volume,
    axis: int,
    start: int,
    stop: int,
    mode: ProjectionMode | str = ProjectionMode.MIP,
) -> np.ndarray:
    """Project a slab of voxels along ``axis``.

    ``axis`` is in (z, y, x) numpy order. ``start`` / ``stop`` are
    inclusive slice indices along that axis.
    """
    if isinstance(mode, str):
        mode = ProjectionMode(mode)
    a = volume.array
    if axis not in (0, 1, 2):
        raise ValueError("axis must be 0, 1 or 2")
    size = a.shape[axis]
    start = int(np.clip(start, 0, size - 1))
    stop = int(np.clip(stop, start, size - 1))
    sub = np.take(a, range(start, stop + 1), axis=axis)

    if mode == ProjectionMode.MIP:
        return sub.max(axis=axis)
    if mode == ProjectionMode.MIN:
        return sub.min(axis=axis)
    if mode == ProjectionMode.MEAN:
        return sub.mean(axis=axis).astype(a.dtype)
    if mode == ProjectionMode.SUM:
        return sub.sum(axis=axis, dtype=np.float32)
    raise ValueError(f"Unknown projection mode: {mode}")


def rotating_mip(
    volume: Volume,
    axis: str = "z",
    n_frames: int = 36,
    pixel_mm: float = 0.7,
) -> np.ndarray:
    """Generate a rotating MIP cine — useful for vessel overview.

    Returns a (n_frames, H, W) uint8 stack already windowed for an
    angio review.
    """
    from scipy.ndimage import map_coordinates
    from .windowing import CT_PRESETS, apply_window

    sz, sy, sx = volume.spacing
    nz, ny, nx = volume.array.shape
    diag = float(np.sqrt((sy * ny) ** 2 + (sx * nx) ** 2))
    h_mm = sz * nz
    w_mm = diag

    rows = int(h_mm / pixel_mm)
    cols = int(w_mm / pixel_mm)

    cz, cy, cx = (nz - 1) / 2.0, (ny - 1) / 2.0, (nx - 1) / 2.0
    out = np.empty((n_frames, rows, cols), dtype=np.uint8)
    wl = CT_PRESETS["Angio"]

    for f in range(n_frames):
        theta = 2.0 * np.pi * f / n_frames
        cos_t = np.cos(theta)
        sin_t = np.sin(theta)
        # Sample plane sweeps around z-axis. Depth axis = perpendicular.
        depth_steps = max(nx, ny)
        rr = (np.arange(rows) - rows / 2.0) * pixel_mm / sz + cz
        cc = (np.arange(cols) - cols / 2.0) * pixel_mm
        dd = (np.arange(depth_steps) - depth_steps / 2.0) * min(sx, sy)
        # u = (0, sin, cos) in (z,y,x); depth = (0, cos, -sin)
        ZZ = rr[:, None, None] + np.zeros((1, cols, depth_steps))
        YY = cy + (cc[None, :, None] * sin_t + dd[None, None, :] * cos_t) / sy
        XX = cx + (cc[None, :, None] * cos_t - dd[None, None, :] * sin_t) / sx
        coords = np.stack([ZZ, YY, XX], axis=0).reshape(3, -1)
        sub = map_coordinates(
            volume.array, coords, order=1, mode="constant", cval=-1024
        ).reshape(rows, cols, depth_steps)
        proj = sub.max(axis=2)
        out[f] = apply_window(proj, wl)
    return out


def slab_thickness_voxels(spacing_along_axis: float, thickness_mm: float) -> int:
    """Translate a slab thickness in mm into half-voxel count."""
    if spacing_along_axis <= 0:
        return 0
    return max(0, int(round(thickness_mm / spacing_along_axis / 2.0)))
