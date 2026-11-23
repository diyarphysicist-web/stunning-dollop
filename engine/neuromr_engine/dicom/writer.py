"""Write 4D volumes as classic single-frame MR Image Storage DICOM series.

Used by the phantom generator and, later, by derived-series export of raw-valued maps.
Pixel values are stored as uint16 with Rescale Slope/Intercept so real-valued data
round-trip within quantisation error.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, MRImageStorage, generate_uid

IMPLEMENTATION_UID_ROOT = "1.2.826.0.1.3680043.8.498."  # pydicom-provided root for generated UIDs


@dataclass
class SeriesSpec:
    """Per-series acquisition description. The fourth axis of the data is `axis_kind`."""

    description: str
    series_number: int
    axis_kind: str = "none"  # "dynamic" | "bvalue" | "echo" | "none"
    times_s: Sequence[float] | None = None
    bvals: Sequence[float] | None = None
    bvecs: np.ndarray | None = None
    echo_times_ms: Sequence[float] | None = None
    te_ms: float = 30.0
    tr_ms: float = 2000.0
    flip_deg: float = 90.0
    field_t: float = 3.0
    pixel_mm: float = 2.0
    slice_mm: float = 4.0
    image_type: Sequence[str] = ("ORIGINAL", "PRIMARY", "M", "NONE")
    extra: dict = field(default_factory=dict)
    # Stored bits: 16 (default), 12 (stored in 16) or 8 (BitsAllocated 8), for codec phantoms.
    bits_stored: int = 16


@dataclass
class StudySpec:
    patient_name: str = "PHANTOM^SYNTHETIC"
    patient_id: str = "NMR-PHANTOM-001"
    patient_sex: str = "O"
    patient_birth_date: str = "19700101"
    study_date: str = "20260101"
    study_description: str = "NeuroMR-PRO synthetic phantom"
    accession: str = "PHANTOM0001"
    seed: str = "neuromr-phantom"

    def uid(self, *parts: object) -> str:
        return generate_uid(prefix=IMPLEMENTATION_UID_ROOT, entropy_srcs=[self.seed, *map(str, parts)])


def _rescale(data: np.ndarray, bits: int = 16) -> tuple[np.ndarray, float, float]:
    top = float(2**bits - 1)
    lo, hi = float(np.min(data)), float(np.max(data))
    slope = (hi - lo) / top if hi > lo else 1.0
    stored = np.round((data - lo) / slope).astype(np.uint8 if bits == 8 else np.uint16)
    return stored, slope, lo


def write_series(data: np.ndarray, out_dir: Path, study: StudySpec, spec: SeriesSpec) -> list[Path]:
    """Write data shaped (z, y, x, n). Returns the written file paths."""
    if data.ndim != 4:
        raise ValueError(f"expected (z, y, x, n) data, got shape {data.shape}")
    out_dir.mkdir(parents=True, exist_ok=True)
    nz, ny, nx, nn = data.shape
    if spec.bits_stored not in (8, 12, 16):
        raise ValueError(f"bits_stored must be 8, 12 or 16, got {spec.bits_stored}")
    stored, slope, intercept = _rescale(data.astype(np.float64), spec.bits_stored)
    study_uid = study.uid("study")
    series_uid = study.uid("series", spec.series_number)
    for_uid = study.uid("for")
    paths: list[Path] = []
    instance = 0
    for k in range(nn):
        for z in range(nz):
            instance += 1
            sop_uid = study.uid("sop", spec.series_number, k, z)
            meta = FileMetaDataset()
            meta.MediaStorageSOPClassUID = MRImageStorage
            meta.MediaStorageSOPInstanceUID = sop_uid
            meta.TransferSyntaxUID = ExplicitVRLittleEndian
            ds = Dataset()
            ds.file_meta = meta
            ds.SOPClassUID = MRImageStorage
            ds.SOPInstanceUID = sop_uid
            ds.SpecificCharacterSet = "ISO_IR 192"
            ds.PatientName = study.patient_name
            ds.PatientID = study.patient_id
            ds.PatientSex = study.patient_sex
            ds.PatientBirthDate = study.patient_birth_date
            ds.StudyInstanceUID = study_uid
            ds.StudyDate = study.study_date
            ds.StudyTime = "120000"
            ds.StudyDescription = study.study_description
            ds.AccessionNumber = study.accession
            ds.StudyID = "1"
            ds.ReferringPhysicianName = ""
            ds.Modality = "MR"
            ds.Manufacturer = "NeuroMR-PRO phantom generator"
            ds.SeriesInstanceUID = series_uid
            ds.SeriesNumber = spec.series_number
            ds.SeriesDescription = spec.description
            ds.FrameOfReferenceUID = for_uid
            ds.PositionReferenceIndicator = ""
            ds.InstanceNumber = instance
            ds.ImageType = list(spec.image_type)
            ds.ScanningSequence = "GR"
            ds.SequenceVariant = "NONE"
            ds.ScanOptions = ""
            ds.MRAcquisitionType = "2D"
            ds.MagneticFieldStrength = spec.field_t
            ds.RepetitionTime = spec.tr_ms
            ds.EchoTime = spec.te_ms
            ds.FlipAngle = spec.flip_deg
            ds.SliceThickness = spec.slice_mm
            ds.SpacingBetweenSlices = spec.slice_mm
            ds.PixelSpacing = [spec.pixel_mm, spec.pixel_mm]
            ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
            x0 = -(nx - 1) * spec.pixel_mm / 2
            y0 = -(ny - 1) * spec.pixel_mm / 2
            ds.ImagePositionPatient = [x0, y0, z * spec.slice_mm]
            ds.SliceLocation = z * spec.slice_mm
            if spec.axis_kind == "dynamic" and spec.times_s is not None:
                ds.TemporalPositionIdentifier = k + 1
                ds.NumberOfTemporalPositions = nn
                ds.TriggerTime = float(spec.times_s[k]) * 1000.0
                ds.AcquisitionNumber = k + 1
            elif spec.axis_kind == "bvalue" and spec.bvals is not None:
                ds.DiffusionBValue = float(spec.bvals[k])
                if spec.bvecs is not None:
                    ds.DiffusionGradientOrientation = [float(v) for v in spec.bvecs[k]]
                    ds.DiffusionDirectionality = "DIRECTIONAL" if spec.bvals[k] > 0 else "NONE"
                ds.AcquisitionNumber = k + 1
            elif spec.axis_kind == "echo" and spec.echo_times_ms is not None:
                ds.EchoNumbers = k + 1
                ds.EchoTime = float(spec.echo_times_ms[k])
            for key, value in spec.extra.items():
                setattr(ds, key, value)
            ds.SamplesPerPixel = 1
            ds.PhotometricInterpretation = "MONOCHROME2"
            ds.Rows, ds.Columns = ny, nx
            ds.BitsAllocated = 8 if spec.bits_stored == 8 else 16
            ds.BitsStored = spec.bits_stored
            ds.HighBit = spec.bits_stored - 1
            ds.PixelRepresentation = 0
            ds.RescaleSlope = f"{slope:.10g}"
            ds.RescaleIntercept = f"{intercept:.10g}"
            ds.RescaleType = "US"
            ds.PixelData = stored[z, :, :, k].tobytes()
            path = out_dir / f"IM{instance:05d}.dcm"
            ds.save_as(path, enforce_file_format=True)
            paths.append(path)
    return paths
