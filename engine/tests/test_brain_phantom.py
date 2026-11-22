"""Anatomical brain phantom: tissue classes, realistic values and the pathology the design imagery relies on.

Generators run on small grids here (one or two slices) so the suite stays fast; the full grids are
written by scripts/make_phantoms.py --only brain.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from neuromr_engine.phantoms import brain
from neuromr_engine.phantoms.brain import BG, CSF, GM, WM, Grid

DISPLAY = Grid((1, 128, 128), 1.8, 5.0, 9.5)  # the 2D display slice (z 9.5 mm)


def _slice_labels(grid: Grid = DISPLAY) -> np.ndarray:
    z = grid.z_mm()
    y = grid.axis_mm(grid.shape[1], grid.pixel_mm, 1)
    x = grid.axis_mm(grid.shape[2], grid.pixel_mm, 1)
    zz, yy, xx = np.meshgrid(z, y, x, indexing="ij")
    lab, _ = brain.anatomy(xx, yy, zz)
    return lab


def test_anatomy_has_all_tissues_and_is_skull_stripped():
    lab = _slice_labels()
    counts = {k: int((lab == k).sum()) for k in (BG, CSF, GM, WM)}
    assert all(v > 0 for v in counts.values()), counts
    # skull-stripped: the image border is background, and nothing but brain and CSF lies inside the head
    border = np.concatenate([lab[0, 0], lab[0, -1], lab[0, :, 0], lab[0, :, -1]])
    assert np.all(border == BG)
    assert set(np.unique(lab)) <= {BG, CSF, GM, WM}
    # white matter is the largest tissue at this level; grey matter forms a cortical ribbon
    assert counts[WM] > counts[GM] > 0.15 * counts[WM]


def test_ventricles_are_central_csf():
    lab = _slice_labels()[0]
    c = lab[48:80, 48:80]  # central 58 × 58 mm
    assert (c == CSF).sum() > 40  # lateral ventricles and the third ventricle


def test_dti_truth_values_are_realistic():
    p = brain.make_brain_dti(n_dirs=6, grid=DISPLAY)
    md, fa = p.truth["md"], p.truth["fa"]
    assert abs(md[1] - 3.0e-3) < 1e-6  # CSF ~3000 ×10⁻⁶ mm²/s
    assert 0.7e-3 < md[2] < 0.9e-3  # grey matter ~800
    assert all(0.7e-3 < m < 0.9e-3 for m in md[3:6])  # white matter ~800
    assert md[6] < 0.62e-3  # stroke core below the mismatch threshold
    assert fa[2] == 0 and all(f > 0.5 for f in fa[3:6])


def test_dti_fit_recovers_tissue_adc():
    p = brain.make_brain_dti(n_dirs=6, snr=1e6, grid=DISPLAY)
    b = p.meta["bvals"]
    s = p.data[0]  # (y, x, b)
    s0 = s[..., b == 0].mean(-1)
    adc = -np.log(np.clip(s[..., b > 0], 1e-6, None) / np.clip(s0[..., None], 1e-6, None)).mean(-1) / b.max()
    lab = p.truth["labels"][0]
    csf = ndimage.binary_erosion(lab == 1)
    wm = ndimage.binary_erosion((lab >= 3) & (lab <= 5))  # away from partial volume with cortex and CSF
    assert abs(np.median(adc[csf]) - 3.0e-3) < 0.3e-3  # CSF ~3000 ×10⁻⁶ mm²/s
    assert abs(np.median(adc[wm]) - 0.8e-3) < 0.1e-3  # normal white matter ~800


def test_dsc_truth_gm_wm_and_stroke():
    c = brain.DSC_CLASSES
    cbf, cbv = np.array(c["cbf"]), np.array(c["cbv"])
    assert 50 <= cbf[2] <= 70 and 18 <= cbf[3] <= 25  # GM ~60, WM ~22 ml/100 g/min
    assert 3.5 <= cbv[2] <= 5 and 1.5 <= cbv[3] <= 2.5  # GM ~4, WM ~2 ml/100 g
    assert cbf[4] < cbf[2] and cbf[6] < cbf[4]  # hypoperfused, then core
    assert c["delay"][4] > 6 and c["delay"][6] > 6  # Tmax > 6 s in the deficit


def test_dsc_phantom_signal_drops_and_has_an_artery():
    p = brain.make_brain_dsc(grid=DISPLAY, n_dyn=30)
    t = p.truth
    np.testing.assert_allclose(t["mtt"][2], 60 * t["cbv"][2] / t["cbf"][2])
    lab = t["labels"][0]
    assert (lab == brain.ARTERY).any()  # the left MCA branch crosses the display slice
    s = p.data[0]  # (y, x, t)
    base, low = s[..., :3].mean(-1), s.min(-1)
    gm = (lab == 2) & (base > 0)
    drop = 1 - np.median(low[gm] / base[gm])
    assert 0.15 < drop < 0.5  # cortical first-pass drop of tens of percent


def test_flair_pair_lesion_changes():
    g = Grid((24, 64, 64), 3.0, 3.0, 20.0)
    base, follow = brain.make_brain_flair_pair(grid=g)
    vb, vf = base.truth["volumes_vox"], follow.truth["volumes_vox"]
    grow, shrink, stable, new, gone = range(5)
    assert vf[grow] > vb[grow] and vf[shrink] < vb[shrink]
    assert vb[new] == 0 < vf[new] and vf[gone] == 0 < vb[gone]
    assert abs(vf[stable] - vb[stable]) <= 0.1 * vb[stable]
