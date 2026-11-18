"""Phantom generator self-checks: ground truth is consistent with the forward models."""

from __future__ import annotations

import numpy as np
import pydicom
import pytest

from neuromr_engine.dicom.writer import SeriesSpec, StudySpec, write_series
from neuromr_engine.phantoms import dce, diffusion, dsc, other


def test_dsc_truth_cbv_equals_cbf_times_mtt():
    p = dsc.make_dsc(snr=1e6, n_dyn=40)
    np.testing.assert_allclose(p.truth["cbv"], p.truth["cbf"] * p.truth["mtt"] / 60.0)
    # Area of the tissue curve scales with CBV (indicator dilution), independent of MTT.
    ratio = p.truth["area"] / p.truth["cbv"]
    assert np.ptp(ratio) / ratio.mean() < 0.02


def test_dsc_first_moment_increases_with_mtt():
    p = dsc.make_dsc(snr=1e6, cbf_levels=(40.0,), mtt_levels=(2.0, 4.0, 8.0))
    assert np.all(np.diff(p.truth["first_moment"]) > 0)
    # First moment of the tissue curve = AIF first moment + residue MTT (exponential residue).
    np.testing.assert_allclose(np.diff(p.truth["first_moment"]), np.diff(p.truth["mtt"]), rtol=0.05)


def test_dsc_signal_drop_and_noise_level():
    p = dsc.make_dsc(snr=50.0)
    lab = p.truth["labels"]
    base = p.data[lab >= 0][:, :3]
    assert abs(base.mean() - dsc.S0) / dsc.S0 < 0.02
    assert abs(base.std() - dsc.S0 / 50.0) / (dsc.S0 / 50.0) < 0.15
    assert p.data[lab >= 0].min() < 0.95 * dsc.S0


def test_dsc_leakage_reference_class_is_unit_scaled():
    p = dsc.make_dsc_leakage(snr=1e6)
    assert p.truth["k1"][0] == 1.0 and p.truth["k2"][0] == 0.0
    assert (p.truth["labels"] == 0).sum() > (p.truth["labels"] > 0).sum() * 0.5


def test_dce_semiquant_noise_and_washin():
    p = dce.make_dce_semiquant(noise_frac=0.0)
    lab = p.truth["labels"]
    curve = p.data[lab == 0][0]
    assert curve[0] == pytest.approx(p.truth["s0"][0])
    np.testing.assert_allclose(
        p.truth["washin"], (p.truth["s1"] - p.truth["s0"]) / (p.truth["t1"] - p.truth["t0"])
    )


def test_tofts_vfa_recovers_t1_noise_free():
    p = dce.make_tofts(snr=1e9)
    tr = p.meta["tr_ms"]
    refs = p.meta["references"]
    lab = p.truth["labels"]
    for i, t1 in enumerate(p.truth["t1"]):
        s = np.array([refs[fa][lab == i][0, 0] for fa in (5.0, 15.0)])
        a = np.deg2rad([5.0, 15.0])
        y, x = s / np.sin(a), s / np.tan(a)
        e1 = (y[1] - y[0]) / (x[1] - x[0])
        assert -tr / np.log(e1) == pytest.approx(t1, rel=1e-3)


def test_dti_truth_fa_range_and_isotropic_zero():
    p = diffusion.make_dti(n_dirs=30, snr=None)
    assert p.truth["fa"][0] == pytest.approx(0.0, abs=1e-12)
    assert 0.7 < p.truth["fa"][2] < 0.9
    assert p.data.shape[-1] == 31


def test_gradient_directions_unit_and_distinct():
    for n in (6, 15, 32, 64):
        g = diffusion.gradient_directions(n)
        np.testing.assert_allclose(np.linalg.norm(g, axis=1), 1.0)
        assert np.linalg.matrix_rank(np.einsum("ki,kj->kij", g, g).reshape(n, 9)) >= 6


def test_ivim_signal_decays_with_b():
    p = diffusion.make_ivim_dki(snr=1e6)
    curve = p.data[p.truth["labels"] == 0][0]
    assert np.all(np.diff(curve) < 0)


def test_fmri_blobs_inside_brain_and_onsets():
    p = other.make_fmri()
    assert p.truth["active"].sum() > 50
    assert np.all(p.truth["brain"][p.truth["active"]])
    assert len(p.truth["onsets"]) == 5


def test_svs_spectrum_peaks_at_metabolite_ppm():
    p = other.make_svs(snr=1e6)
    spec = np.fft.fftshift(np.fft.fft(p.data))
    n = p.data.size
    freqs = np.fft.fftshift(np.fft.fftfreq(n, 1 / p.meta["bw_hz"]))
    ppm = p.meta["ref_ppm"] + freqs / p.meta["f0_mhz"]
    peak_ppm = ppm[np.argmax(np.abs(spec))]
    assert peak_ppm == pytest.approx(other.METABOLITES["NAA"][0], abs=0.02)


def test_flair_pair_volume_changes():
    b, f = other.make_flair_pair()
    vb, vf = b.truth["volumes_vox"], f.truth["volumes_vox"]
    assert vf[0] > vb[0] and vf[1] < vb[1] and vf[2] == vb[2] and vb[3] == 0 and vf[4] == 0


def test_dicom_round_trip(tmp_path):
    p = dsc.make_dsc(snr=50.0, n_dyn=8, shape=(2, 16, 16))
    paths = write_series(
        p.data, tmp_path, StudySpec(), SeriesSpec("DSC test", 1, "dynamic", times_s=p.meta["times"])
    )
    assert len(paths) == 2 * 8
    ds = pydicom.dcmread(paths[-1])
    assert ds.Modality == "MR" and ds.NumberOfTemporalPositions == 8
    assert ds.TemporalPositionIdentifier == 8
    restored = ds.pixel_array * float(ds.RescaleSlope) + float(ds.RescaleIntercept)
    np.testing.assert_allclose(restored, p.data[1, :, :, 7], atol=float(ds.RescaleSlope))
    uids = {pydicom.dcmread(x).SOPInstanceUID for x in paths}
    assert len(uids) == len(paths)
