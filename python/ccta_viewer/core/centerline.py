"""Vessel centerline tools.

The viewer offers two ways to obtain a centerline:

1. The user clicks anchor points along a vessel — :func:`smooth_path`
   then runs a Catmull-Rom / cubic spline through them at sub-voxel
   resolution.
2. Two endpoints are picked and a Frangi-vesselness cost map is built;
   :func:`track_centerline` finds the minimum-cost path through the
   bright tubular structure between them using a Dijkstra search over
   a 26-connected voxel graph.

Both produce a :class:`Centerline` of densely sampled (z, y, x) points
in voxel coordinates that the CPR module then sweeps along.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import numpy as np
from scipy.interpolate import splev, splprep
from scipy.ndimage import gaussian_filter

from .volume import Volume


@dataclass
class Centerline:
    points: np.ndarray  # (N, 3) z, y, x voxel coords
    name: str = "vessel"
    tangents: Optional[np.ndarray] = field(default=None, repr=False)

    def __post_init__(self) -> None:
        self.points = np.asarray(self.points, dtype=np.float64)
        if self.points.ndim != 2 or self.points.shape[1] != 3:
            raise ValueError("points must be (N, 3)")
        if self.tangents is None:
            self.tangents = _compute_tangents(self.points)

    @property
    def n_points(self) -> int:
        return self.points.shape[0]

    def length_mm(self, spacing: Tuple[float, float, float]) -> float:
        diffs = np.diff(self.points, axis=0) * np.array(spacing)
        return float(np.linalg.norm(diffs, axis=1).sum())

    def resample(self, n: int) -> "Centerline":
        if self.n_points < 2 or n < 2:
            return self
        cumdist = np.concatenate(
            [[0.0], np.cumsum(np.linalg.norm(np.diff(self.points, axis=0), axis=1))]
        )
        if cumdist[-1] == 0:
            return self
        targets = np.linspace(0.0, cumdist[-1], n)
        out = np.empty((n, 3))
        for k in range(3):
            out[:, k] = np.interp(targets, cumdist, self.points[:, k])
        return Centerline(out, name=self.name)


def _compute_tangents(points: np.ndarray) -> np.ndarray:
    if points.shape[0] < 2:
        return np.tile(np.array([1.0, 0.0, 0.0]), (points.shape[0], 1))
    grad = np.gradient(points, axis=0)
    norms = np.linalg.norm(grad, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return grad / norms


# ----------------------------------------------------------------------
# Spline through manual anchors
# ----------------------------------------------------------------------
def smooth_path(anchors: Sequence[Sequence[float]], samples: int = 200, k: int = 3) -> Centerline:
    pts = np.asarray(anchors, dtype=np.float64)
    if pts.shape[0] < 2:
        raise ValueError("Need at least 2 anchor points")
    if pts.shape[0] == 2:
        return Centerline(_linear_interp(pts, samples))
    k_eff = min(k, pts.shape[0] - 1)
    tck, _ = splprep([pts[:, 0], pts[:, 1], pts[:, 2]], k=k_eff, s=0)
    u = np.linspace(0.0, 1.0, samples)
    z, y, x = splev(u, tck)
    return Centerline(np.column_stack([z, y, x]))


def _linear_interp(pts: np.ndarray, samples: int) -> np.ndarray:
    t = np.linspace(0, 1, samples)
    return (1 - t)[:, None] * pts[0] + t[:, None] * pts[1]


# ----------------------------------------------------------------------
# Frangi vesselness (simple multi-scale)
# ----------------------------------------------------------------------
def vesselness_filter(
    volume: Volume,
    scales: Sequence[float] = (0.8, 1.5, 2.5),
    alpha: float = 0.5,
    beta: float = 0.5,
    c: float = 70.0,
    bright_on_dark: bool = True,
) -> np.ndarray:
    """Multi-scale Frangi-like vesselness response.

    Implementation is intentionally compact — not a research-grade
    filter, but adequate for guiding centerline tracking.
    """
    arr = volume.array.astype(np.float32)
    response = np.zeros_like(arr, dtype=np.float32)
    for sigma in scales:
        sm = gaussian_filter(arr, sigma=sigma)
        # Hessian eigenvalues: use central differences twice.
        gz, gy, gx = np.gradient(sm)
        Hzz = np.gradient(gz, axis=0)
        Hyy = np.gradient(gy, axis=1)
        Hxx = np.gradient(gx, axis=2)
        Hzy = np.gradient(gz, axis=1)
        Hzx = np.gradient(gz, axis=2)
        Hyx = np.gradient(gy, axis=2)

        # Approximate eigenvalues via trace/determinant simplifications
        # would be too crude. Use closed-form for symmetric 3x3.
        l1, l2, l3 = _eig3_sym(Hxx, Hyy, Hzz, Hyx, Hzx, Hzy)
        # Sort by absolute value: |l1| <= |l2| <= |l3|
        absl = np.stack([np.abs(l1), np.abs(l2), np.abs(l3)], axis=0)
        order = np.argsort(absl, axis=0)
        l_sorted = np.take_along_axis(np.stack([l1, l2, l3]), order, axis=0)
        l1s, l2s, l3s = l_sorted[0], l_sorted[1], l_sorted[2]

        Ra = np.abs(l2s) / (np.abs(l3s) + 1e-12)
        Rb = np.abs(l1s) / (np.sqrt(np.abs(l2s * l3s)) + 1e-12)
        S = np.sqrt(l1s ** 2 + l2s ** 2 + l3s ** 2)

        v = (
            (1 - np.exp(-(Ra ** 2) / (2 * alpha ** 2)))
            * np.exp(-(Rb ** 2) / (2 * beta ** 2))
            * (1 - np.exp(-(S ** 2) / (2 * c ** 2)))
        )
        if bright_on_dark:
            v[(l2s > 0) | (l3s > 0)] = 0
        else:
            v[(l2s < 0) | (l3s < 0)] = 0
        response = np.maximum(response, v * (sigma ** 2))
    return response


def _eig3_sym(a, b, c_, d, e, f):
    """Eigenvalues of a symmetric 3x3 matrix [[a,d,e],[d,b,f],[e,f,c]] per voxel."""
    # Use Cardano's method — vectorised.
    p1 = d * d + e * e + f * f
    q = (a + b + c_) / 3.0
    p2 = (a - q) ** 2 + (b - q) ** 2 + (c_ - q) ** 2 + 2 * p1
    p = np.sqrt(p2 / 6.0) + 1e-12
    B11 = (a - q) / p
    B22 = (b - q) / p
    B33 = (c_ - q) / p
    B12 = d / p
    B13 = e / p
    B23 = f / p
    detB = (
        B11 * (B22 * B33 - B23 * B23)
        - B12 * (B12 * B33 - B23 * B13)
        + B13 * (B12 * B23 - B22 * B13)
    )
    r = np.clip(detB / 2.0, -1.0, 1.0)
    phi = np.arccos(r) / 3.0
    eig1 = q + 2 * p * np.cos(phi)
    eig3 = q + 2 * p * np.cos(phi + (2 * np.pi / 3))
    eig2 = 3 * q - eig1 - eig3
    return eig1, eig2, eig3


# ----------------------------------------------------------------------
# Dijkstra centerline tracking
# ----------------------------------------------------------------------
_NEIGHBOURS_26 = [
    (dz, dy, dx)
    for dz in (-1, 0, 1)
    for dy in (-1, 0, 1)
    for dx in (-1, 0, 1)
    if not (dz == 0 and dy == 0 and dx == 0)
]


def track_centerline(
    volume: Volume,
    start: Tuple[int, int, int],
    end: Tuple[int, int, int],
    cost: Optional[np.ndarray] = None,
    max_steps: int = 200_000,
) -> Centerline:
    """Minimum-cost path between ``start`` and ``end`` voxels.

    If no ``cost`` array is provided, a default cost is built from the
    HU intensity (penalising low-HU voxels — i.e. preferring contrast-
    filled vessel lumen) which is acceptable for coronary CTA but the
    caller may pass a Frangi vesselness map for better results.
    """
    if cost is None:
        cost = _default_cost(volume.array)

    nz, ny, nx = cost.shape
    start_idx = tuple(int(v) for v in start)
    end_idx = tuple(int(v) for v in end)

    INF = np.float32(np.inf)
    dist = np.full(cost.shape, INF, dtype=np.float32)
    parent = -np.ones(cost.shape + (3,), dtype=np.int16)

    heap: List[Tuple[float, Tuple[int, int, int]]] = []
    dist[start_idx] = 0.0
    heapq.heappush(heap, (0.0, start_idx))

    spacing = np.array(volume.spacing, dtype=np.float64)
    steps = 0
    while heap and steps < max_steps:
        d, (z, y, x) = heapq.heappop(heap)
        steps += 1
        if (z, y, x) == end_idx:
            break
        if d > dist[z, y, x]:
            continue
        for dz, dy, dx in _NEIGHBOURS_26:
            nz_, ny_, nx_ = z + dz, y + dy, x + dx
            if not (0 <= nz_ < nz and 0 <= ny_ < ny and 0 <= nx_ < nx):
                continue
            step_mm = float(np.linalg.norm(np.array([dz, dy, dx]) * spacing))
            edge = step_mm * (1.0 + cost[nz_, ny_, nx_])
            nd = d + edge
            if nd < dist[nz_, ny_, nx_]:
                dist[nz_, ny_, nx_] = nd
                parent[nz_, ny_, nx_] = (z, y, x)
                heapq.heappush(heap, (nd, (nz_, ny_, nx_)))

    # Reconstruct
    path: List[Tuple[int, int, int]] = []
    cur = end_idx
    while cur != (-1, -1, -1) and cur != start_idx:
        path.append(cur)
        p = tuple(int(v) for v in parent[cur[0], cur[1], cur[2]])
        if p == (-1, -1, -1):
            break
        cur = p
    path.append(start_idx)
    path.reverse()
    return Centerline(np.array(path, dtype=np.float64))


def _default_cost(array: np.ndarray) -> np.ndarray:
    """Cheap fallback cost: invert HU after clipping to vessel range."""
    a = array.astype(np.float32)
    # Coronaries with iodine contrast are typically 250-600 HU.
    a = np.clip(a, 0, 600) / 600.0
    return (1.0 - a).astype(np.float32)
