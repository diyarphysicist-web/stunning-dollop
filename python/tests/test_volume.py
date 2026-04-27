"""Tests for the core (non-UI) modules."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccta_viewer.core.calcium_scoring import AgatstonScorer, agatston_weight
from ccta_viewer.core.centerline import smooth_path, track_centerline
from ccta_viewer.core.cpr import CurvedPlanarReformatter
from ccta_viewer.core.measurements import (
    AngleMeasurement,
    DistanceMeasurement,
    compute_roi_stats,
)
from ccta_viewer.core.mip import ProjectionMode, slab_projection
from ccta_viewer.core.mpr import MPRSlicer, ObliqueSlicer
from ccta_viewer.core.volume import Volume
from ccta_viewer.core.windowing import CT_PRESETS, WindowLevel, apply_window
from tests.synthetic import make_synthetic_volume


@pytest.fixture(scope="module")
def vol() -> Volume:
    return make_synthetic_volume(shape=(32, 128, 128))


# ----------------------------------------------------------------------
def test_volume_shape_and_spacing(vol):
    assert vol.shape == (32, 128, 128)
    assert vol.spacing == (0.6, 0.4, 0.4)
    assert vol.voxel_volume_mm3 == pytest.approx(0.6 * 0.4 * 0.4)


def test_world_to_voxel_round_trip(vol):
    ijk = np.array([10.0, 20.0, 30.0])
    xyz = vol.voxel_to_world(ijk)
    back = vol.world_to_voxel(xyz)
    np.testing.assert_allclose(back, ijk, atol=1e-6)


# ----------------------------------------------------------------------
def test_windowing_clips_correctly():
    arr = np.linspace(-1000, 2000, 100, dtype=np.int16)
    wl = WindowLevel(800, 200)
    out = apply_window(arr, wl)
    assert out.dtype == np.uint8
    assert out.min() == 0
    assert out.max() == 255


def test_ct_presets_cover_cardiac():
    for must_have in ["Cardiac", "Coronary", "Lung", "Bone", "Calcium", "Mediastinum"]:
        assert must_have in CT_PRESETS


# ----------------------------------------------------------------------
def test_mpr_orthogonal(vol):
    s = MPRSlicer(vol)
    a = s.slice("axial", 16)
    c = s.slice("coronal", 64)
    g = s.slice("sagittal", 64)
    assert a.image.shape == (128, 128)
    assert c.image.shape == (32, 128)
    assert g.image.shape == (32, 128)


def test_mpr_thick_slab(vol):
    s = MPRSlicer(vol)
    thin = s.slice("axial", 16)
    slab = s.thick_slab("axial", 16, thickness_mm=4.0, mode="max")
    # max projection is >= thin slice at every pixel.
    assert (slab.image >= thin.image - 1).all()


def test_oblique_slicer_returns_isotropic(vol):
    s = ObliqueSlicer(vol)
    out = s.sample(
        center=(16, 64, 64),
        u=(0.0, 1.0, 0.0),
        v=(0.0, 0.0, 1.0),
        size=(64, 64),
        pixel_mm=0.5,
    )
    assert out.image.shape == (64, 64)
    assert out.spacing == (0.5, 0.5)


# ----------------------------------------------------------------------
def test_slab_projection_shapes(vol):
    out = slab_projection(vol, axis=0, start=0, stop=5, mode=ProjectionMode.MIP)
    assert out.shape == vol.shape[1:]


# ----------------------------------------------------------------------
def test_smooth_path_creates_dense_polyline():
    anchors = [(0, 0, 0), (5, 5, 5), (10, 10, 0)]
    cl = smooth_path(anchors, samples=50)
    assert cl.points.shape == (50, 3)
    assert cl.length_mm((1.0, 1.0, 1.0)) > 0


def test_track_centerline_finds_path(vol):
    start = (5, 64 + 50, 64)
    end = (25, 64 + 50, 64)
    cl = track_centerline(vol, start, end, max_steps=20_000)
    assert cl.n_points >= 2
    assert tuple(cl.points[0].astype(int)) == start
    assert tuple(cl.points[-1].astype(int)) == end


# ----------------------------------------------------------------------
def test_cpr_runs_on_synthetic(vol):
    anchors = [(z, 64 + 50, 64) for z in range(5, 30, 5)]
    cl = smooth_path(anchors, samples=80)
    cpr = CurvedPlanarReformatter(vol)
    res = cpr.stretched_cpr(cl, width_mm=20.0, pixel_mm=0.5)
    assert res.image.ndim == 2
    assert res.arc_length_mm > 0


# ----------------------------------------------------------------------
def test_agatston_weight_levels():
    assert agatston_weight(150) == 1
    assert agatston_weight(250) == 2
    assert agatston_weight(350) == 3
    assert agatston_weight(500) == 4
    assert agatston_weight(100) == 0


def test_calcium_scoring_finds_plaques(vol):
    report = AgatstonScorer(min_area_mm2=0.5).score(vol)
    assert report.total_agatston() > 0
    assert len(report.lesions) >= 1
    # risk_category returns a non-empty label for any non-zero score.
    assert report.risk_category() != "Very low (0)"
    assert report.total_mass_mg() > 0


# ----------------------------------------------------------------------
def test_distance_and_angle_measurements():
    d = DistanceMeasurement((0, 0, 0), (0, 3, 4))
    assert d.length_mm((1.0, 1.0, 1.0)) == pytest.approx(5.0)

    a = AngleMeasurement((0, 1, 0), (0, 0, 0), (0, 0, 1))
    assert a.angle_deg((1.0, 1.0, 1.0)) == pytest.approx(90.0, abs=1e-3)


def test_roi_stats_basic():
    img = np.array([[100, 200], [300, 400]], dtype=np.int16)
    mask = np.array([[1, 1], [0, 0]], dtype=bool)
    stats = compute_roi_stats(img, mask, (1.0, 1.0))
    assert stats.n_pixels == 2
    assert stats.mean == 150
    assert stats.area_mm2 == 2.0


# ----------------------------------------------------------------------
def test_dicom_loader_round_trip():
    """Write a synthetic series, then load it back through the public API."""
    pytest.importorskip("pydicom")
    from tests.synthetic import save_synthetic_dicom_series
    from ccta_viewer.core.dicom_loader import load_series

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "series"
        save_synthetic_dicom_series(out, make_synthetic_volume(shape=(8, 32, 32)))
        loaded = load_series(out)
        assert loaded.shape == (8, 32, 32)
        # Spacing read back should match.
        assert loaded.spacing[1] == pytest.approx(0.4, abs=1e-3)
