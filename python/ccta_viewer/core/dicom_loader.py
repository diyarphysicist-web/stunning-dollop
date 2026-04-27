"""DICOM series loading.

Walks a directory of .dcm files, groups them by SeriesInstanceUID,
sorts each series along its scan axis using ImagePositionPatient and
ImageOrientationPatient, applies the modality LUT (rescale slope /
intercept), and assembles a :class:`Volume`.

For 4D cardiac CT, slices that share a SeriesInstanceUID and slice
location but differ in CardiacNumberOfImages / TriggerTime are
collected as separate phases of the same volume.
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np

try:
    import pydicom
    from pydicom.dataset import FileDataset
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "pydicom is required for DICOM loading; install with `pip install pydicom`"
    ) from exc

from .volume import Volume

log = logging.getLogger(__name__)


@dataclass
class SeriesInfo:
    series_uid: str
    description: str
    modality: str
    n_images: int
    patient_name: str
    study_date: str
    files: List[str]


def _is_dicom(path: str) -> bool:
    try:
        with open(path, "rb") as f:
            f.seek(128)
            return f.read(4) == b"DICM"
    except OSError:
        return False


def _read_header(path: str) -> Optional[FileDataset]:
    try:
        return pydicom.dcmread(path, stop_before_pixels=True, force=True)
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("Skipping %s: %s", path, exc)
        return None


def _slice_position(ds: FileDataset) -> float:
    """Compute the position of a slice along its normal direction.

    Uses ImageOrientationPatient × ImagePositionPatient when available
    (robust against oblique acquisitions), falls back to SliceLocation
    or InstanceNumber.
    """
    iop = getattr(ds, "ImageOrientationPatient", None)
    ipp = getattr(ds, "ImagePositionPatient", None)
    if iop is not None and ipp is not None:
        row = np.array(iop[0:3], dtype=np.float64)
        col = np.array(iop[3:6], dtype=np.float64)
        normal = np.cross(row, col)
        return float(np.dot(np.array(ipp, dtype=np.float64), normal))
    if hasattr(ds, "SliceLocation"):
        return float(ds.SliceLocation)
    return float(getattr(ds, "InstanceNumber", 0))


class DicomLoader:
    """Discover and load DICOM series from a directory tree."""

    def __init__(self, root: str | os.PathLike):
        self.root = Path(root)

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------
    def scan(self) -> List[SeriesInfo]:
        groups: Dict[str, List[Tuple[str, FileDataset]]] = defaultdict(list)
        for path in self._walk_files():
            ds = _read_header(path)
            if ds is None:
                continue
            uid = getattr(ds, "SeriesInstanceUID", None)
            if uid is None:
                continue
            groups[uid].append((path, ds))

        result: List[SeriesInfo] = []
        for uid, items in groups.items():
            items.sort(key=lambda kv: _slice_position(kv[1]))
            head = items[0][1]
            result.append(
                SeriesInfo(
                    series_uid=uid,
                    description=str(getattr(head, "SeriesDescription", "")),
                    modality=str(getattr(head, "Modality", "")),
                    n_images=len(items),
                    patient_name=str(getattr(head, "PatientName", "")),
                    study_date=str(getattr(head, "StudyDate", "")),
                    files=[p for p, _ in items],
                )
            )
        result.sort(key=lambda s: (s.study_date, s.description))
        return result

    def _walk_files(self) -> Iterable[str]:
        if self.root.is_file():
            yield str(self.root)
            return
        for dirpath, _dirnames, filenames in os.walk(self.root):
            for name in filenames:
                full = os.path.join(dirpath, name)
                if name.lower().endswith((".dcm", ".dicom", ".ima")) or _is_dicom(full):
                    yield full

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def load(self, series: SeriesInfo) -> Volume:
        return _build_volume(series.files)


def load_series(path: str | os.PathLike) -> Volume:
    """Convenience: load the first / largest series found under `path`."""
    loader = DicomLoader(path)
    series = loader.scan()
    if not series:
        raise FileNotFoundError(f"No DICOM series found under {path}")
    series.sort(key=lambda s: s.n_images, reverse=True)
    return loader.load(series[0])


# ----------------------------------------------------------------------
# Volume assembly
# ----------------------------------------------------------------------
def _build_volume(files: List[str]) -> Volume:
    datasets = [pydicom.dcmread(p, force=True) for p in files]
    datasets.sort(key=_slice_position)

    head = datasets[0]
    rows = int(head.Rows)
    cols = int(head.Columns)
    n = len(datasets)

    # Detect cardiac multi-phase: same SliceLocation appears multiple times.
    positions = [_slice_position(d) for d in datasets]
    unique_pos = sorted(set(round(p, 3) for p in positions))
    n_unique = len(unique_pos)
    n_phases = n // n_unique if n_unique > 0 and n % n_unique == 0 and n > n_unique else 1

    # In-plane spacing
    pixel_spacing = getattr(head, "PixelSpacing", [1.0, 1.0])
    sy, sx = float(pixel_spacing[0]), float(pixel_spacing[1])

    # Slice spacing — prefer derived spacing from positions.
    if n_unique >= 2:
        sz = float(unique_pos[1] - unique_pos[0])
    else:
        sz = float(getattr(head, "SliceThickness", 1.0))
    if sz == 0.0:
        sz = float(getattr(head, "SliceThickness", 1.0)) or 1.0

    # Orientation
    iop = getattr(head, "ImageOrientationPatient", None)
    if iop is not None:
        row = np.array(iop[0:3], dtype=np.float64)
        col = np.array(iop[3:6], dtype=np.float64)
        normal = np.cross(row, col)
        direction = np.column_stack([row, col, normal])
    else:
        direction = np.eye(3)

    ipp = getattr(head, "ImagePositionPatient", (0.0, 0.0, 0.0))
    origin = tuple(float(v) for v in ipp)

    slope = float(getattr(head, "RescaleSlope", 1.0))
    intercept = float(getattr(head, "RescaleIntercept", 0.0))

    if n_phases > 1:
        phases = np.empty((n_phases, n_unique, rows, cols), dtype=np.int16)
        per_phase: Dict[int, List[FileDataset]] = defaultdict(list)
        for ds, pos in zip(datasets, positions):
            per_phase[unique_pos.index(round(pos, 3))].append(ds)
        # Each unique slice position holds n_phases datasets — pivot.
        for slice_idx, pos in enumerate(unique_pos):
            slice_dss = sorted(
                per_phase[slice_idx],
                key=lambda d: float(getattr(d, "TriggerTime", 0)),
            )
            for phase_idx, ds in enumerate(slice_dss[:n_phases]):
                phases[phase_idx, slice_idx] = _apply_modality_lut(
                    ds.pixel_array, slope, intercept
                )
        array = phases[0]
    else:
        array = np.empty((n, rows, cols), dtype=np.int16)
        for i, ds in enumerate(datasets):
            array[i] = _apply_modality_lut(ds.pixel_array, slope, intercept)
        phases = None

    metadata = _extract_metadata(head)

    return Volume(
        array=array,
        spacing=(abs(sz), sy, sx),
        origin=origin,
        direction=direction,
        rescale_slope=1.0,  # already applied
        rescale_intercept=0.0,
        modality=str(getattr(head, "Modality", "CT")),
        metadata=metadata,
        phases=phases,
    )


def _apply_modality_lut(pixels: np.ndarray, slope: float, intercept: float) -> np.ndarray:
    if slope == 1.0 and intercept == 0.0:
        return pixels.astype(np.int16, copy=False)
    out = pixels.astype(np.float32) * slope + intercept
    return np.clip(out, -2048, 8192).astype(np.int16)


def _extract_metadata(ds: FileDataset) -> Dict[str, str]:
    keys = [
        "PatientName",
        "PatientID",
        "PatientBirthDate",
        "PatientSex",
        "PatientAge",
        "StudyDate",
        "StudyTime",
        "StudyDescription",
        "SeriesDescription",
        "Modality",
        "Manufacturer",
        "ManufacturerModelName",
        "KVP",
        "XRayTubeCurrent",
        "ExposureTime",
        "ConvolutionKernel",
        "SliceThickness",
        "PixelSpacing",
        "AcquisitionDate",
        "AcquisitionTime",
        "BodyPartExamined",
        "ContrastBolusAgent",
        "HeartRate",
    ]
    out: Dict[str, str] = {}
    for key in keys:
        if hasattr(ds, key):
            out[key] = str(getattr(ds, key))
    return out
