"""Build a synthetic CCTA-like volume for tests / demos.

Creates a stack of 64 slices, 256x256, with:
  * a soft-tissue background (~40 HU)
  * a curved tubular structure (~300 HU) representing a coronary
  * three small calcified plaques (~600-900 HU)

No external data required.
"""

from __future__ import annotations

from pathlib import Path
from typing import Tuple

import numpy as np

from ccta_viewer.core.volume import Volume


def make_synthetic_volume(
    shape: Tuple[int, int, int] = (64, 256, 256),
    spacing: Tuple[float, float, float] = (0.6, 0.4, 0.4),
) -> Volume:
    nz, ny, nx = shape
    arr = np.full(shape, -100, dtype=np.int16)  # air-ish background

    # Soft tissue blob.
    zz, yy, xx = np.indices(shape)
    cz, cy, cx = nz / 2, ny / 2, nx / 2
    soft = ((zz - cz) ** 2 / (nz * 0.45) ** 2
            + (yy - cy) ** 2 / (ny * 0.4) ** 2
            + (xx - cx) ** 2 / (nx * 0.4) ** 2) <= 1
    arr[soft] = 40

    # Curved vessel — helix-ish.
    t = np.linspace(0, 4 * np.pi, 200)
    radius = 50
    vy = (cy + radius * np.cos(t)).astype(int)
    vx = (cx + radius * np.sin(t)).astype(int)
    vz = np.linspace(5, nz - 5, 200).astype(int)
    for z, y, x in zip(vz, vy, vx):
        rr = 4
        for dz in range(-1, 2):
            for dy in range(-rr, rr + 1):
                for dx in range(-rr, rr + 1):
                    if dy * dy + dx * dx <= rr * rr:
                        zz_, yy_, xx_ = z + dz, y + dy, x + dx
                        if 0 <= zz_ < nz and 0 <= yy_ < ny and 0 <= xx_ < nx:
                            arr[zz_, yy_, xx_] = 300

    # Calcified plaques on the vessel.
    for idx in (40, 90, 140):
        z, y, x = vz[idx], vy[idx], vx[idx]
        for dz in range(-1, 2):
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    if dy * dy + dx * dx <= 4:
                        zz_, yy_, xx_ = z + dz, y + dy, x + dx
                        if 0 <= zz_ < nz and 0 <= yy_ < ny and 0 <= xx_ < nx:
                            arr[zz_, yy_, xx_] = 700

    return Volume(arr, spacing=spacing, modality="CT")


def save_synthetic_dicom_series(out_dir: Path, vol: Volume | None = None) -> Path:
    """Write a synthetic series as plain DICOMs so the loader can ingest it.

    Used by the loader test — kept lazy because pydicom must be importable.
    """
    import pydicom
    from pydicom.dataset import Dataset, FileDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    out_dir.mkdir(parents=True, exist_ok=True)
    vol = vol or make_synthetic_volume()
    series_uid = generate_uid()
    study_uid = generate_uid()
    sop_class_uid = "1.2.840.10008.5.1.4.1.1.2"  # CT Image Storage

    for z in range(vol.shape[0]):
        ds = FileDataset(str(out_dir / f"slice_{z:03d}.dcm"), {}, preamble=b"\x00" * 128)
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        ds.file_meta = Dataset()
        ds.file_meta.MediaStorageSOPClassUID = sop_class_uid
        ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()
        ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds.SOPClassUID = sop_class_uid
        ds.SOPInstanceUID = ds.file_meta.MediaStorageSOPInstanceUID
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.Modality = "CT"
        ds.PatientName = "TEST^SUBJECT"
        ds.PatientID = "0001"
        ds.SeriesDescription = "Synthetic CCTA"
        ds.Rows, ds.Columns = vol.shape[1], vol.shape[2]
        ds.PixelSpacing = [vol.spacing[1], vol.spacing[2]]
        ds.SliceThickness = vol.spacing[0]
        ds.ImagePositionPatient = [0.0, 0.0, float(z * vol.spacing[0])]
        ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        ds.RescaleSlope = 1
        ds.RescaleIntercept = 0
        ds.BitsAllocated = 16
        ds.BitsStored = 16
        ds.HighBit = 15
        ds.PixelRepresentation = 1  # signed
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.InstanceNumber = z + 1
        ds.PixelData = vol.array[z].astype(np.int16).tobytes()
        ds.save_as(str(out_dir / f"slice_{z:03d}.dcm"))
    return out_dir
