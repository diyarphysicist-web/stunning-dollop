"""Volume data model for a CT series.

A Volume bundles the 3D pixel array (in Hounsfield Units when the
modality is CT), voxel spacing, world-to-voxel orientation, and the
selection of DICOM metadata most useful to a viewer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

import numpy as np


@dataclass
class Volume:
    """3D scalar volume with spatial metadata.

    Axes are stored as (z, y, x) — the standard numpy/ITK layout where
    z is the slice index and (y, x) are in-plane.
    """

    array: np.ndarray
    spacing: Tuple[float, float, float]  # (z, y, x) in millimetres
    origin: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    direction: np.ndarray = field(
        default_factory=lambda: np.eye(3, dtype=np.float64)
    )
    rescale_slope: float = 1.0
    rescale_intercept: float = 0.0
    modality: str = "CT"
    metadata: Dict[str, Any] = field(default_factory=dict)
    phases: Optional[np.ndarray] = None  # (T, Z, Y, X) for 4D cardiac

    def __post_init__(self) -> None:
        if self.array.ndim != 3:
            raise ValueError(
                f"Volume array must be 3D, got shape {self.array.shape}"
            )
        if len(self.spacing) != 3:
            raise ValueError("spacing must be a 3-tuple (z, y, x)")
        self.direction = np.asarray(self.direction, dtype=np.float64)
        if self.direction.shape != (3, 3):
            raise ValueError("direction must be 3x3")

    # ------------------------------------------------------------------
    # Shape helpers
    # ------------------------------------------------------------------
    @property
    def shape(self) -> Tuple[int, int, int]:
        return tuple(self.array.shape)  # type: ignore[return-value]

    @property
    def n_slices(self) -> int:
        return self.array.shape[0]

    @property
    def is_4d(self) -> bool:
        return self.phases is not None and self.phases.ndim == 4

    @property
    def n_phases(self) -> int:
        return 0 if self.phases is None else self.phases.shape[0]

    @property
    def physical_size_mm(self) -> Tuple[float, float, float]:
        sz, sy, sx = self.spacing
        nz, ny, nx = self.shape
        return (sz * nz, sy * ny, sx * nx)

    @property
    def voxel_volume_mm3(self) -> float:
        sz, sy, sx = self.spacing
        return float(sz * sy * sx)

    # ------------------------------------------------------------------
    # Coordinate conversion
    # ------------------------------------------------------------------
    def voxel_to_world(self, ijk: np.ndarray) -> np.ndarray:
        """Convert (z, y, x) voxel indices to (x, y, z) world coords (mm).

        Accepts a single (3,) vector or an (N, 3) array.
        """
        ijk = np.atleast_2d(np.asarray(ijk, dtype=np.float64))
        # Reorder to (x, y, z) physical axes used by the direction matrix.
        zyx_spacing = np.array(self.spacing, dtype=np.float64)
        physical = ijk * zyx_spacing  # still (z, y, x)
        physical_xyz = physical[:, ::-1]
        world = physical_xyz @ self.direction.T + np.asarray(self.origin)
        return world if world.shape[0] > 1 else world[0]

    def world_to_voxel(self, xyz: np.ndarray) -> np.ndarray:
        xyz = np.atleast_2d(np.asarray(xyz, dtype=np.float64))
        local_xyz = (xyz - np.asarray(self.origin)) @ self.direction
        local_zyx = local_xyz[:, ::-1]
        ijk = local_zyx / np.array(self.spacing, dtype=np.float64)
        return ijk if ijk.shape[0] > 1 else ijk[0]

    # ------------------------------------------------------------------
    # HU helpers (CT)
    # ------------------------------------------------------------------
    def to_hu(self) -> np.ndarray:
        """Return the volume in Hounsfield Units.

        Most CT loaders apply rescale at load time — in that case the
        slope is 1.0 and intercept 0.0 so this is a no-op. Kept here so
        callers can be agnostic about whether rescale has been applied.
        """
        if self.rescale_slope == 1.0 and self.rescale_intercept == 0.0:
            return self.array
        return self.array.astype(np.float32) * self.rescale_slope + self.rescale_intercept

    def value_at(self, ijk: Tuple[float, float, float]) -> float:
        """Trilinear sample at fractional voxel coordinates."""
        from scipy.ndimage import map_coordinates

        coords = np.array(ijk, dtype=np.float64).reshape(3, 1)
        return float(
            map_coordinates(self.array, coords, order=1, mode="constant", cval=-1024)[0]
        )

    def stats(self) -> Dict[str, float]:
        a = self.array
        return {
            "min": float(a.min()),
            "max": float(a.max()),
            "mean": float(a.mean()),
            "std": float(a.std()),
        }

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return (
            f"Volume(shape={self.shape}, spacing={self.spacing}, "
            f"modality={self.modality!r}, phases={self.n_phases})"
        )
