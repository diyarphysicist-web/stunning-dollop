"""Write a 4D volume as one Enhanced MR Image Storage instance (multi-frame, GEN-240 test data).

Frames are stored point by point (all slices of the first dynamic / b-value / echo, then the next),
with per-frame Plane Position, Frame Content, MR Echo, MR Diffusion and Temporal Position groups,
and shared Pixel Measures, Plane Orientation, MR Timing and Pixel Value Transformation groups, the
way scanner enhanced exports are laid out.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import UID, ExplicitVRLittleEndian

from .writer import SeriesSpec, StudySpec, _rescale

ENHANCED_MR_IMAGE_STORAGE = UID("1.2.840.10008.5.1.4.1.1.4.1")

# Classic Scanning Sequence values → Enhanced MR Pulse Sequence attributes (ALGORITHMS.md §13).
_ECHO_PULSE = {frozenset({"SE"}): "SPIN", frozenset({"GR"}): "GRADIENT", frozenset({"SE", "GR"}): "BOTH"}


def _item(**attrs: object) -> Dataset:
    ds = Dataset()
    for key, value in attrs.items():
        setattr(ds, key, value)
    return ds


def _pulse_sequence(ds: Dataset, scanning: object) -> None:
    values = {scanning} if isinstance(scanning, str) else set(scanning or [])  # type: ignore[arg-type]
    echo = _ECHO_PULSE.get(frozenset(values & {"SE", "GR"}), "GRADIENT")
    ds.EchoPulseSequence = echo
    ds.EchoPlanarPulseSequence = "YES" if "EP" in values else "NO"
    ds.InversionRecovery = "YES" if "IR" in values else "NO"


def write_enhanced_series(data: np.ndarray, out_dir: Path, study: StudySpec, spec: SeriesSpec) -> Path:
    """Write data shaped (z, y, x, n) as one multi-frame file. Returns its path."""
    if data.ndim != 4:
        raise ValueError(f"expected (z, y, x, n) data, got shape {data.shape}")
    out_dir.mkdir(parents=True, exist_ok=True)
    nz, ny, nx, nn = data.shape
    stored, slope, intercept = _rescale(data.astype(np.float64))
    sop_uid = study.uid("enhanced-sop", spec.series_number)
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = ENHANCED_MR_IMAGE_STORAGE
    meta.MediaStorageSOPInstanceUID = sop_uid
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = Dataset()
    ds.file_meta = meta
    ds.SOPClassUID = ENHANCED_MR_IMAGE_STORAGE
    ds.SOPInstanceUID = sop_uid
    ds.SpecificCharacterSet = "ISO_IR 192"
    ds.PatientName = study.patient_name
    ds.PatientID = study.patient_id
    ds.PatientSex = study.patient_sex
    ds.PatientBirthDate = study.patient_birth_date
    ds.StudyInstanceUID = study.uid("study")
    ds.StudyDate = study.study_date
    ds.StudyTime = "120000"
    ds.StudyDescription = study.study_description
    ds.AccessionNumber = study.accession
    ds.StudyID = "1"
    ds.ReferringPhysicianName = ""
    ds.Modality = "MR"
    ds.Manufacturer = "NeuroMR-PRO phantom generator"
    ds.SeriesInstanceUID = study.uid("series", spec.series_number)
    ds.SeriesNumber = spec.series_number
    ds.SeriesDescription = spec.description
    ds.FrameOfReferenceUID = study.uid("for")
    ds.PositionReferenceIndicator = ""
    ds.InstanceNumber = 1
    ds.ImageType = list(spec.image_type)
    ds.ContentDate = study.study_date
    ds.ContentTime = "120000"
    ds.AcquisitionDateTime = f"{study.study_date}120000"
    ds.MagneticFieldStrength = spec.field_t
    ds.MRAcquisitionType = "2D"
    extra = dict(spec.extra)
    _pulse_sequence(ds, extra.pop("ScanningSequence", "GR"))
    extra.pop("SequenceVariant", None)
    inversion = extra.pop("InversionTime", None)
    agent = extra.pop("ContrastBolusAgent", None)
    if agent:
        ds.ContrastBolusAgentSequence = Sequence(
            [_item(CodeValue="C-17800", CodingSchemeDesignator="SRT", CodeMeaning=agent)]
        )
    for key, value in extra.items():
        setattr(ds, key, value)
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows, ds.Columns = ny, nx
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.NumberOfFrames = nz * nn

    shared = _item(
        PixelMeasuresSequence=Sequence(
            [
                _item(
                    PixelSpacing=[spec.pixel_mm, spec.pixel_mm],
                    SliceThickness=spec.slice_mm,
                    SpacingBetweenSlices=spec.slice_mm,
                )
            ]
        ),
        PlaneOrientationSequence=Sequence([_item(ImageOrientationPatient=[1, 0, 0, 0, 1, 0])]),
        MRTimingAndRelatedParametersSequence=Sequence(
            [_item(RepetitionTime=spec.tr_ms, FlipAngle=spec.flip_deg)]
        ),
        PixelValueTransformationSequence=Sequence(
            [_item(RescaleSlope=f"{slope:.10g}", RescaleIntercept=f"{intercept:.10g}", RescaleType="US")]
        ),
    )
    if inversion is not None:
        shared.MRModifierSequence = Sequence([_item(InversionTimes=[float(inversion)])])
    ds.SharedFunctionalGroupsSequence = Sequence([shared])

    x0 = -(nx - 1) * spec.pixel_mm / 2
    y0 = -(ny - 1) * spec.pixel_mm / 2
    frames: list[Dataset] = []
    pixels = []
    for k in range(nn):
        for z in range(nz):
            content = _item(StackID="1", InStackPositionNumber=z + 1, DimensionIndexValues=[k + 1, z + 1])
            group = _item(
                FrameContentSequence=Sequence([content]),
                PlanePositionSequence=Sequence([_item(ImagePositionPatient=[x0, y0, z * spec.slice_mm])]),
            )
            te = spec.te_ms
            if spec.axis_kind == "dynamic" and spec.times_s is not None:
                content.TemporalPositionIndex = k + 1
                group.TemporalPositionSequence = Sequence(
                    [_item(TemporalPositionTimeOffset=float(spec.times_s[k]))]
                )
            elif spec.axis_kind == "bvalue" and spec.bvals is not None:
                b = float(spec.bvals[k])
                diff = _item(DiffusionBValue=b, DiffusionDirectionality="DIRECTIONAL" if b > 0 else "NONE")
                if spec.bvecs is not None and b > 0:
                    diff.DiffusionGradientDirectionSequence = Sequence(
                        [_item(DiffusionGradientOrientation=[float(v) for v in spec.bvecs[k]])]
                    )
                group.MRDiffusionSequence = Sequence([diff])
            elif spec.axis_kind == "echo" and spec.echo_times_ms is not None:
                te = float(spec.echo_times_ms[k])
            group.MREchoSequence = Sequence([_item(EffectiveEchoTime=te)])
            frames.append(group)
            pixels.append(stored[z, :, :, k])
    ds.PerFrameFunctionalGroupsSequence = Sequence(frames)
    ds.PixelData = np.stack(pixels).tobytes()
    path = out_dir / "ENHANCED.dcm"
    ds.save_as(path, enforce_file_format=True)
    return path
