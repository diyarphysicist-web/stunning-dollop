"""Anatomically shaped digital brain phantom (skull-stripped) and the design series built on it.

The anatomy is analytic, in millimetres, with the origin at the centre of the cerebrum:
x = patient left (+) / right (-), y = posterior (+) / anterior (-), z = superior (+) / inferior (-).
Tissues: CSF (outer subarachnoid rim, sulci, interhemispheric and Sylvian fissures, lateral, third
and temporal-horn ventricles), cortical and deep grey matter (caudate, thalamus, lentiform nucleus),
white matter (with fibre orientation: corpus callosum R-L, corticospinal tract S-I, elsewhere A-P),
cerebellum and brainstem. Cortical folding is the zero level set of a warped sum of plane waves,
so sulci meander in every plane; the cortex is a ribbon under the surface and around each sulcus.

Every series is sampled with partial volume: each voxel holds the volume fraction of every tissue
class (supersampled 2 x 2 in-plane and 3 through the slice), and the signal is the fraction-weighted
sum of the class signals. Truth holds the per-class parameters, the majority-class label map and
the lesion masks.

Pathology (all on the same head, so every package shows the same patient):
- Stroke in the right MCA territory: core (ADC x 0.55, CBF x 0.2, CBV x 0.45) inside a larger
  hypoperfused region (CBF x 0.45, CBV x 1.05), both with a delayed bolus (Tmax > 6 s).
- Enhancing tumour in the left frontal lobe: enhancing rim and a necrotic centre.
- Five periventricular / deep white-matter MS-like lesions for the FLAIR follow-up pair
  (grow, shrink, stable, new, disappear), with central veins for FLAIR*.
- Task activation in the left hand motor cortex, supplementary motor area and left superior parietal cortex.
- Arteries for the DSC arterial input: both anterior cerebral arteries.

Typical values: ADC 0.80e-3 mm2/s in GM and WM, 3.0e-3 mm2/s in CSF; CBF 60 (GM) and
22 (WM) ml/100 g/min; CBV 4.0 (GM) and 2.0 (WM) ml/100 g; T1 1400 (GM), 850 (WM), 4000 (CSF) ms.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .common import Phantom, add_rician, gamma_variate, rng
from .dce import piecewise_curve, population_aif, spgr, tofts_tissue
from .diffusion import gradient_directions, tensor
from .dsc import K_R2, TE_S, tissue_curve
from .other import hrf

BG, CSF, GM, WM = 0, 1, 2, 3
DIR_NONE, DIR_AP, DIR_LR, DIR_SI = 0, 1, 2, 3

# Cerebrum ellipsoid (semi-axes, centre z) and folding
CEREBRUM = (67.0, 84.0, 58.0)
CEREBRUM_Z = 10.0


@dataclass(frozen=True)
class Grid:
    """Image grid: shape (z, y, x), in-plane pixel and slice spacing [mm], z of the slab centre [mm]."""

    shape: tuple[int, int, int]
    pixel_mm: float
    slice_mm: float
    z_centre_mm: float = 0.0

    def axis_mm(self, n: int, step: float, sub: int, centre: float = 0.0) -> np.ndarray:
        """Sample positions [mm] of n voxels, each split into `sub` sub-samples."""
        k = (np.arange(n * sub) + 0.5) / sub - 0.5  # voxel index units, sub-sample centres
        return centre + (k - (n - 1) / 2) * step

    def z_mm(self) -> np.ndarray:
        return self.axis_mm(self.shape[0], self.slice_mm, 1, self.z_centre_mm)


def _ell(
    x: np.ndarray, y: np.ndarray, z: np.ndarray, c: tuple[float, float, float], a: tuple[float, float, float]
) -> np.ndarray:
    return ((x - c[0]) / a[0]) ** 2 + ((y - c[1]) / a[1]) ** 2 + ((z - c[2]) / a[2]) ** 2 <= 1.0


# Sulci: zero level set of a warped sum of plane waves (wavelength ~21 mm), so they meander in every plane.
_WAVES = (
    ((0.83, 0.31, 0.46), (0.10, 0.95, 0.30), 1.3),
    ((-0.25, 0.88, 0.40), (0.90, -0.20, 0.38), 0.4),
    ((0.40, -0.35, 0.85), (0.30, 0.50, -0.81), 2.1),
    ((0.55, 0.60, -0.58), (-0.70, 0.25, 0.67), 3.0),
)
_K = 2 * np.pi / 21.0
_WARP = 1.6


def sulcal_distance(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    """Approximate distance [mm] to the nearest sulcus: |N| / |grad N| for the warped wave field N."""
    n = np.zeros(x.shape)
    gx, gy, gz = np.zeros(x.shape), np.zeros(x.shape), np.zeros(x.shape)
    for k1, k2, ph in _WAVES:
        a = _K * (k1[0] * x + k1[1] * y + k1[2] * z) + ph
        b = 0.7 * _K * (k2[0] * x + k2[1] * y + k2[2] * z)
        arg = a + _WARP * np.sin(b)
        n += np.sin(arg)
        c = np.cos(arg)
        cb = _WARP * np.cos(b) * 0.7 * _K
        gx += c * (_K * k1[0] + cb * k2[0])
        gy += c * (_K * k1[1] + cb * k2[1])
        gz += c * (_K * k1[2] + cb * k2[2])
    return np.abs(n) / np.maximum(np.sqrt(gx * gx + gy * gy + gz * gz), 0.15)


def anatomy(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Tissue label (BG, CSF, GM, WM) and white-matter fibre direction class at points [mm]."""
    ax = CEREBRUM[0] * (1.0 - 0.07 * np.clip(-y / CEREBRUM[1], 0, 1))  # narrower frontal pole
    ay, az = CEREBRUM[1], CEREBRUM[2]
    zr = z - CEREBRUM_Z
    rho = np.sqrt((x / ax) ** 2 + (y / ay) ** 2 + (zr / az) ** 2)
    r = np.sqrt(x * x + y * y + zr * zr) + 1e-6
    depth = r * (1.0 / np.maximum(rho, 1e-6) - 1.0)  # distance to the surface along the ray [mm]
    dist_sulcus = sulcal_distance(x, y, z)
    cerebrum = rho <= 1.0
    lab = np.where(cerebrum, WM, BG).astype(np.int8)
    # cortex: a ribbon under the surface and around every sulcus, deepest at the fundus
    lab[cerebrum & ((depth < 2.8) | ((dist_sulcus < 3.0) & (depth < 17.0)))] = GM
    lab[cerebrum & ((depth < 1.1) | ((dist_sulcus < 0.65) & (depth < 14.0)))] = CSF
    # interhemispheric fissure above the corpus callosum and at the poles, lined with cortex
    fissure = cerebrum & ((z > 26) | (y < -42) | (y > 44))
    lab[fissure & (np.abs(x) < 4.5) & (lab == WM)] = GM
    lab[fissure & (np.abs(x) < 0.9)] = CSF
    # Sylvian fissure with the insular cortex
    syl = cerebrum & (np.abs(x) > 38) & (z > -14) & (z < 16) & (depth < 20)
    dist = np.abs(y - (2.0 - 0.35 * z) - 0.45 * (np.abs(x) - 38) - 3.0 * np.sin(0.25 * np.abs(x)))
    lab[syl & (dist < 4.5) & (lab == WM)] = GM
    lab[syl & (dist < 1.4)] = CSF
    # deep grey matter (both hemispheres)
    for s in (-1.0, 1.0):
        for c, a in (
            ((12.0, -15.0, 12.0), (5.0, 9.0, 7.0)),
            ((9.0, 6.0, 3.0), (7.0, 11.0, 7.0)),
            ((22.0, -2.0, 5.0), (5.0, 14.0, 8.0)),
        ):
            lab[_ell(x, y, z, (s * c[0], c[1], c[2]), a) & cerebrum] = GM
    # ventricles
    vent = np.zeros(x.shape, bool)
    for s in (-1.0, 1.0):
        zc = 17.0 - 0.006 * y * y
        vent |= ((x - s * 7.5) / 4.5) ** 2 + (y / 26.0) ** 2 + ((z - zc) / 6.0) ** 2 <= 1.0  # bodies
        vent |= _ell(x, y, z, (s * 8.0, -24.0, 10.0), (4.5, 9.0, 6.5))  # frontal horns
        vent |= _ell(x, y, z, (s * 15.0, 25.0, 10.0), (5.5, 9.0, 6.5))  # atria / occipital horns
        vent |= _ell(x, y, z, (s * 30.0, 0.0, -12.0), (2.5, 14.0, 2.5))  # temporal horns
    vent |= (np.abs(x) < 2.0) & (y > -8) & (y < 14) & (z > -6) & (z < 10)  # third ventricle
    lab[vent & cerebrum] = CSF
    # brainstem and cerebellum below the cerebrum
    stem = ((x / 12.0) ** 2 + ((y - 16.0) / 13.0) ** 2 <= 1.0) & (z < -4) & (z > -62)
    lab[stem & (lab == BG)] = WM
    cb = (x / 50.0) ** 2 + ((y - 48.0) / 27.0) ** 2 + ((z + 32.0) / 19.0) ** 2
    cb_in = (cb <= 1.0) & (lab == BG)
    folia = np.abs(np.sin(z * 1.1 + 0.08 * x * x / 10.0)) < 0.25
    lab[cb_in] = GM
    lab[cb_in & (cb < 0.45) & (np.abs(x) > 6)] = WM
    lab[cb_in & folia & (cb > 0.75)] = CSF
    # fibre directions in white matter
    d = np.where(lab == WM, DIR_AP, DIR_NONE).astype(np.int8)
    cc = ((x / 22.0) ** 2 + (y / 14.0) ** 2 + ((z - 23.0) / 6.0) ** 2) <= 1.0
    cst = (((np.abs(x) - 23.0) / 8.0) ** 2 + ((y - 1.0) / 8.0) ** 2) <= 1.0
    d[(lab == WM) & cst] = DIR_SI
    d[(lab == WM) & cc] = DIR_LR
    d[stem & (lab == WM)] = DIR_SI
    return lab, d


# ── Pathology (all in millimetres) ─────────────────────────────────────────────
STROKE_CORE = ((-30.0, -2.0, 6.0), (12.0, 15.0, 12.0))
STROKE_DEFICIT = ((-42.0, -4.0, 10.0), (25.0, 36.0, 26.0))
TUMOUR = ((38.0, -40.0, 22.0), 14.0, 6.0)  # centre, outer radius, necrotic radius
# MS-like lesions: centre, baseline radius, follow-up radius [mm] (0 = absent).
# Changes: grow, shrink, stable, new, disappear. Heights (z) order the lesions as L1 grow, L2 new,
# L3 shrink (two veins), L4 stable (central vein), L5 disappear: the order the screens use.
MS_LESIONS: tuple[tuple[tuple[float, float, float], float, float], ...] = (
    ((-17.0, -6.0, 14.0), 3.0, 4.5),
    ((19.0, 14.0, 20.0), 4.5, 3.0),
    ((-22.0, 26.0, 24.0), 3.75, 3.75),
    ((24.0, -22.0, 17.0), 0.0, 3.0),
    ((14.0, -30.0, 28.0), 3.0, 0.0),
)
CENTRAL_VEIN_LESIONS = (0, 2)
MULTI_VEIN_LESIONS = (1,)
# Left hand motor cortex, supplementary motor area, left superior parietal cortex: centre, radius [mm]
ACTIVATION = (((42.0, 12.0, 46.0), 7.0), ((4.0, -4.0, 54.0), 6.0), ((30.0, 40.0, 44.0), 6.0))
# Artery for the DSC arterial input: a left MCA (M2) branch running up the left Sylvian fissure, cut across
# by the display slice (the right MCA is occluded). Through-plane, it keeps partial volume small.
ARTERIES = (((40.0, -6.0, -2.0), (41.0, -3.0, 20.0), 1.6),)


def stroke(x: np.ndarray, y: np.ndarray, z: np.ndarray, lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    tissue = (lab == GM) | (lab == WM)
    core = _ell(x, y, z, *STROKE_CORE) & tissue & (x < -6)
    deficit = (_ell(x, y, z, *STROKE_DEFICIT) & tissue & (x < -6)) | core
    return core, deficit & ~core


def tumour(x: np.ndarray, y: np.ndarray, z: np.ndarray, lab: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    (cx, cy, cz), ro, rn = TUMOUR
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2)
    inside = (lab != BG) & (d <= ro)
    return inside & (d > rn), inside & (d <= rn)


def ms_lesions(x: np.ndarray, y: np.ndarray, z: np.ndarray, time_point: int) -> list[np.ndarray]:
    out = []
    for c, *radii in MS_LESIONS:
        rad = radii[time_point]
        out.append(_ell(x, y, z, c, (rad, rad, rad)) if rad > 0 else np.zeros(x.shape, bool))
    return out


def activation(x: np.ndarray, y: np.ndarray, z: np.ndarray, lab: np.ndarray) -> np.ndarray:
    act = np.zeros(x.shape, bool)
    for c, rad in ACTIVATION:
        act |= _ell(x, y, z, c, (rad, rad, rad))
    return act & (lab == GM)


# ── Partial-volume sampling ────────────────────────────────────────────────────
ClassFn = Callable[[np.ndarray, np.ndarray, np.ndarray], np.ndarray]


def fractions(
    grid: Grid, classify: ClassFn, n_classes: int, sub: tuple[int, int, int] = (3, 2, 2)
) -> np.ndarray:
    """Volume fraction of each class per voxel, shape (n_classes, z, y, x)."""
    nz, ny, nx = grid.shape
    sz, sy, sx = sub
    xs = grid.axis_mm(nx, grid.pixel_mm, sx)
    ys = grid.axis_mm(ny, grid.pixel_mm, sy)
    out = np.zeros((n_classes, nz, ny, nx), np.float32)
    for iz in range(nz):
        zs = grid.axis_mm(1, grid.slice_mm, sz, grid.z_mm()[iz])
        zz, yy, xx = np.meshgrid(zs, ys, xs, indexing="ij")
        c = classify(xx, yy, zz)
        for k in range(n_classes):
            out[k, iz] = (c == k).reshape(sz, ny, sy, nx, sx).mean(axis=(0, 2, 4))
    return out


def majority(frac: np.ndarray) -> np.ndarray:
    return np.argmax(frac, axis=0).astype(np.int8)


def mix(frac: np.ndarray, class_signal: np.ndarray) -> np.ndarray:
    """Fraction-weighted sum: frac (C, z, y, x) and class_signal (C, n) -> (z, y, x, n)."""
    return np.einsum("czyx,cn->zyxn", frac, class_signal)


# ── Grids of the design series ─────────────────────────────────────────────────
GRID_2D = Grid((8, 128, 128), 1.8, 5.0, 12.0)  # perfusion and diffusion: 8 slices of 5 mm
GRID_3D = Grid((96, 128, 128), 1.5, 1.5, 0.0)  # FLAIR, SWI, multi-echo: 1.5 mm isotropic
GRID_FMRI = Grid((6, 64, 64), 3.0, 5.0, 38.0)  # BOLD: 3 mm in-plane, 6 slices of 5 mm over the motor cortex
DISPLAY_SLICE_2D = 3  # 0-based slice through the stroke core, deep grey matter and ventricles


# ── DSC with the right-MCA stroke ──────────────────────────────────────────────
# classes: bg, CSF, GM, WM, GM deficit, WM deficit, GM core, WM core, artery (signal follows the AIF)
DSC_CLASSES = dict(
    s0=(0.0, 1300.0, 900.0, 780.0, 910.0, 790.0, 950.0, 830.0, 700.0),
    cbf=(0.0, 0.0, 60.0, 22.0, 27.0, 10.0, 12.0, 4.4, 0.0),
    cbv=(0.0, 0.0, 4.0, 2.0, 4.2, 2.1, 1.8, 0.9, 0.0),
    delay=(0.0, 0.0, 0.0, 0.0, 7.0, 7.0, 8.0, 8.0, 0.0),
)
ARTERY = 8


def _tube(
    x: np.ndarray,
    y: np.ndarray,
    z: np.ndarray,
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    rad: float,
) -> np.ndarray:
    pa = np.stack([x - a[0], y - a[1], z - a[2]], -1)
    ab = np.array(b) - np.array(a)
    t = np.clip(pa @ ab / (ab @ ab), 0, 1)
    d = pa - t[..., None] * ab
    return (d * d).sum(-1) <= rad * rad


def _dsc_class(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    lab, _ = anatomy(x, y, z)
    core, deficit = stroke(x, y, z, lab)
    c = lab.astype(np.int8).copy()
    c[deficit & (lab == GM)] = 4
    c[deficit & (lab == WM)] = 5
    c[core & (lab == GM)] = 6
    c[core & (lab == WM)] = 7
    for a, b, rad in ARTERIES:
        c[_tube(x, y, z, a, b, rad) & (lab != BG)] = ARTERY
    return c


# ΔR2* per unit tracer concentration is larger in tissue than in large vessels (the κ term of the DSC
# model). The gain gives a peak cortical ΔR2* of ~12 1/s (a ~30 % signal drop at TE 30 ms) next to the
# ~60 % arterial drop. CBF and CBV truth are unchanged: absolute scaling comes from the AIF in analysis.
TISSUE_GAIN = 20.0


def make_brain_dsc(
    snr: float = 50.0, tr: float = 1.5, n_dyn: int = 60, seed: int = 21, grid: Grid = GRID_2D
) -> Phantom:
    """GRE-EPI DSC of the brain phantom. ΔR2* = K · CBF · (AIF(t - delay) ⊗ exp(-t / MTT))."""
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    tf = np.arange(0.0, t[-1] + 0.05, 0.05)
    aif_f = 30.0 * gamma_variate(tf, 12.0, 3.0, 1.5) / gamma_variate(tf, 12.0, 3.0, 1.5).max()
    cls = DSC_CLASSES
    n_cls = len(cls["s0"])
    sig = np.zeros((n_cls, n_dyn))
    mtt = np.zeros(n_cls)
    for k in range(n_cls):
        if k == ARTERY:
            c = np.interp(t, tf, aif_f)
        elif cls["cbf"][k] > 0:
            mtt[k] = 60.0 * cls["cbv"][k] / cls["cbf"][k]
            shifted = np.interp(tf - cls["delay"][k], tf, aif_f, left=0.0)
            c = TISSUE_GAIN * np.interp(t, tf, tissue_curve(tf, shifted, cls["cbf"][k], mtt[k]))
        else:
            c = np.zeros(n_dyn)
        sig[k] = cls["s0"][k] * np.exp(-TE_S * K_R2 * c)
    frac = fractions(grid, _dsc_class, n_cls)
    data = add_rician(mix(frac, sig), 900.0 / snr, gen)
    truth = {k: np.array(v) for k, v in cls.items()} | {
        "mtt": mtt,
        "labels": majority(frac),
        "aif_dr2": np.interp(t, tf, aif_f),
        "tissue_gain": TISSUE_GAIN,
        "display_slice": DISPLAY_SLICE_2D,
    }
    return Phantom(
        "brain_dsc", data.astype(np.float32), truth, dict(kind="DSC", te=TE_S, tr=tr, times=t, grid=grid)
    )


# ── DTI / DWI with the stroke core ─────────────────────────────────────────────
# classes: bg, CSF, GM, WM A-P, WM R-L, WM S-I, GM core, WM core
_EV_WM = (1.45e-3, 0.48e-3, 0.48e-3)
DTI_CLASSES = (
    ((0.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.0),
    ((3.0e-3,) * 3, (1.0, 0.0, 0.0), 2200.0),
    ((0.82e-3,) * 3, (1.0, 0.0, 0.0), 1050.0),
    (_EV_WM, (0.0, 1.0, 0.0), 800.0),
    ((1.70e-3, 0.32e-3, 0.32e-3), (1.0, 0.0, 0.0), 800.0),
    ((1.60e-3, 0.40e-3, 0.40e-3), (0.0, 0.0, 1.0), 800.0),
    ((0.45e-3,) * 3, (1.0, 0.0, 0.0), 1150.0),
    ((0.80e-3, 0.26e-3, 0.26e-3), (0.0, 1.0, 0.0), 1000.0),
)


def _dti_class(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    lab, d = anatomy(x, y, z)
    core, _ = stroke(x, y, z, lab)
    c = np.where(lab == WM, 2 + d, lab).astype(np.int8)
    c[core & (lab == GM)] = 6
    c[core & (lab == WM)] = 7
    return c


def make_brain_dti(
    n_dirs: int = 32,
    bvals: tuple[float, ...] = (0.0, 1000.0),
    snr: float = 30.0,
    seed: int = 22,
    grid: Grid = GRID_2D,
) -> Phantom:
    gen = rng(seed)
    dirs = gradient_directions(n_dirs)
    bv, bvec = [], []
    for b in bvals:
        for g in [np.zeros(3)] if b == 0 else dirs:
            bv.append(b)
            bvec.append(g)
    bv, bvec = np.array(bv), np.array(bvec)
    sig = np.zeros((len(DTI_CLASSES), len(bv)))
    md, fa = [], []
    for k, (ev, e1, s0) in enumerate(DTI_CLASSES):
        dt = tensor(ev, np.array(e1)) if s0 > 0 else np.zeros((3, 3))
        sig[k] = s0 * np.exp(-bv * np.einsum("ki,ij,kj->k", bvec, dt, bvec))
        e = np.array(ev)
        m = e.mean()
        md.append(m)
        fa.append(float(np.sqrt(1.5) * np.linalg.norm(e - m) / max(np.linalg.norm(e), 1e-12)))
    frac = fractions(grid, _dti_class, len(DTI_CLASSES))
    data = add_rician(mix(frac, sig), 1000.0 / snr, gen)
    truth = {
        "labels": majority(frac),
        "md": np.array(md),
        "fa": np.array(fa),
        "display_slice": DISPLAY_SLICE_2D,
        "slice_z_mm": grid.z_mm(),
    }
    return Phantom(
        f"brain_dti_{n_dirs}dir",
        data.astype(np.float32),
        truth,
        dict(kind="DTI", bvals=bv, bvecs=bvec, grid=grid),
    )


# ── IVIM / DKI ─────────────────────────────────────────────────────────────────
# classes: bg, CSF, GM, WM, core
IVIM_CLASSES = dict(
    s0=(0.0, 2200.0, 1000.0, 850.0, 1100.0),
    d=(0.0, 3.0e-3, 0.82e-3, 0.78e-3, 0.45e-3),
    f=(0.0, 0.0, 0.08, 0.04, 0.03),
    dstar=(0.0, 0.0, 15e-3, 12e-3, 10e-3),
    k=(0.0, 0.0, 0.75, 1.05, 1.40),
)


def _ivim_class(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    lab, _ = anatomy(x, y, z)
    core, _ = stroke(x, y, z, lab)
    c = lab.astype(np.int8).copy()
    c[core] = 4
    return c


def make_brain_ivim(
    bvals: tuple[float, ...] = (0, 10, 20, 50, 100, 200, 400, 600, 800, 1000, 1500, 2000),
    snr: float = 80.0,
    seed: int = 23,
    grid: Grid = Grid((4, 128, 128), 1.8, 5.0, 4.5),
) -> Phantom:
    gen = rng(seed)
    b = np.asarray(bvals, float)
    c = IVIM_CLASSES
    sig = np.zeros((len(c["s0"]), len(b)))
    for k in range(len(c["s0"])):
        tissue = np.exp(-b * c["d"][k] + (b * c["d"][k]) ** 2 * c["k"][k] / 6.0)
        perf = np.exp(-b * c["dstar"][k]) if c["dstar"][k] > 0 else 0.0
        sig[k] = c["s0"][k] * ((1 - c["f"][k]) * tissue + c["f"][k] * perf)
    frac = fractions(grid, _ivim_class, len(c["s0"]))
    data = add_rician(mix(frac, sig), 1000.0 / snr, gen)
    truth = {k: np.array(v) for k, v in c.items()} | {"labels": majority(frac), "display_slice": 1}
    return Phantom("brain_ivim_dki", data.astype(np.float32), truth, dict(kind="DWI", bvals=b, grid=grid))


# ── DCE (semi-quantitative) and permeability (extended Tofts + VFA) ─────────────
# classes: bg, CSF, GM, WM, enhancing tumour rim, necrosis
DCE_GRID = Grid((4, 128, 128), 1.8, 5.0, 24.0)
TOFTS_CLASSES = dict(
    ktrans=(0.0, 0.0, 0.002, 0.001, 0.12, 0.025),
    ve=(0.2, 0.2, 0.20, 0.20, 0.35, 0.60),
    vp=(0.0, 0.0, 0.045, 0.020, 0.070, 0.005),
    t1=(4000.0, 4000.0, 1400.0, 850.0, 1500.0, 2200.0),
    m0=(0.0, 3400.0, 3000.0, 2700.0, 3000.0, 3300.0),
)


def _dce_class(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    lab, _ = anatomy(x, y, z)
    rim, nec = tumour(x, y, z, lab)
    c = lab.astype(np.int8).copy()
    c[rim] = 4
    c[nec] = 5
    return c


def make_brain_tofts(
    snr: float = 60.0,
    dt: float = 4.0,
    n_dyn: int = 60,
    seed: int = 24,
    tr_ms: float = 4.0,
    fa_dce: float = 15.0,
    vfa: tuple[float, float] = (5.0, 15.0),
    r1: float = 4.5,
    grid: Grid = DCE_GRID,
) -> Phantom:
    gen = rng(seed)
    t = np.arange(n_dyn) * dt
    fine = np.arange(0, t[-1] + 0.5, 0.5)
    cp_f = population_aif(fine)
    c = TOFTS_CLASSES
    n_cls = len(c["t1"])
    dce = np.zeros((n_cls, n_dyn))
    refs = {fa: np.zeros((n_cls, 1)) for fa in vfa}
    for k in range(n_cls):
        kep = c["ktrans"][k] / c["ve"][k]
        ct = np.interp(t, fine, tofts_tissue(fine, cp_f, c["ktrans"][k], kep, c["vp"][k]))
        r1t = 1000.0 / c["t1"][k] + r1 * ct
        dce[k] = [spgr(c["m0"][k], 1000.0 / rr, tr_ms, fa_dce) for rr in r1t]
        for fa in vfa:
            refs[fa][k] = spgr(c["m0"][k], c["t1"][k], tr_ms, fa)
    frac = fractions(grid, _dce_class, n_cls)
    sigma = spgr(3000.0, 1200.0, tr_ms, fa_dce) / snr
    data = np.abs(mix(frac, dce) + gen.normal(0, sigma, frac.shape[1:] + (n_dyn,)))
    references = {
        fa: np.abs(mix(frac, v) + gen.normal(0, sigma, frac.shape[1:] + (1,))).astype(np.float32)
        for fa, v in refs.items()
    }
    truth = {k: np.array(v) for k, v in c.items() if k != "m0"} | {
        "kep": np.array(c["ktrans"]) / np.array(c["ve"]),
        "labels": majority(frac),
        "aif_cp": np.interp(t, fine, cp_f),
        "display_slice": 1,
    }
    return Phantom(
        "brain_dce_tofts",
        data.astype(np.float32),
        truth,
        dict(kind="DCE", times=t, tr_ms=tr_ms, fa=fa_dce, r1=r1, references=references, grid=grid),
    )


# Semi-quantitative curves per class: s0, t0, t1, s1, washout (piecewise model, DCE-007)
SEMIQUANT_CLASSES = dict(
    s0=(0.0, 120.0, 300.0, 340.0, 310.0, 260.0),
    t0=(15.0, 15.0, 15.0, 15.0, 15.0, 25.0),
    t1=(45.0, 45.0, 35.0, 35.0, 45.0, 95.0),
    s1=(0.0, 120.0, 330.0, 355.0, 640.0, 360.0),
    washout=(0.0, 0.0, -0.1, -0.05, -1.6, 0.4),
)


def make_brain_dce_semiquant(
    noise_frac: float = 0.02, tr: float = 10.0, n_dyn: int = 12, seed: int = 25, grid: Grid = DCE_GRID
) -> Phantom:
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    c = SEMIQUANT_CLASSES
    n_cls = len(c["s0"])
    sig = np.array(
        [
            piecewise_curve(t, c["s0"][k], c["t0"][k], c["t1"][k], c["s1"][k], c["washout"][k])
            for k in range(n_cls)
        ]
    )
    frac = fractions(grid, _dce_class, n_cls)
    data = np.clip(mix(frac, sig) + gen.normal(0, noise_frac * 400.0, frac.shape[1:] + (n_dyn,)), 0, None)
    truth = {k: np.array(v) for k, v in c.items()} | {"labels": majority(frac), "display_slice": 1}
    s0, s1 = truth["s0"], truth["s1"]
    truth["washin"] = (s1 - s0) / (truth["t1"] - truth["t0"])
    truth["maxenh"] = s1 - s0
    truth["maxrelenh"] = np.where(s0 > 0, (s1 / np.maximum(s0, 1e-9) - 1.0) * 100.0, 0.0)
    return Phantom(
        "brain_dce_semiquant", data.astype(np.float32), truth, dict(kind="DCE", tr=tr, times=t, grid=grid)
    )


# ── fMRI block design ──────────────────────────────────────────────────────────
# classes: bg, CSF, GM, WM, active GM
FMRI_S0 = (0.0, 1500.0, 1100.0, 950.0, 1100.0)


def _fmri_class(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    lab, _ = anatomy(x, y, z)
    c = lab.astype(np.int8).copy()
    c[activation(x, y, z, lab)] = 4
    return c


def make_brain_fmri(
    snr: float = 100.0,
    tr: float = 2.0,
    n_dyn: int = 100,
    block_dyn: int = 10,
    amplitude: float = 0.03,
    seed: int = 26,
    grid: Grid = GRID_FMRI,
) -> Phantom:
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    box = ((np.arange(n_dyn) // block_dyn) % 2 == 1).astype(float)
    reg = np.convolve(box, hrf(np.arange(0, 32, tr)))[:n_dyn]
    reg /= reg.max()
    sig = np.array([np.full(n_dyn, s) for s in FMRI_S0])
    sig[4] *= 1 + amplitude * reg
    frac = fractions(grid, _fmri_class, len(FMRI_S0))
    data = add_rician(mix(frac, sig), 1000.0 / snr, gen)
    onsets = t[np.flatnonzero(np.diff(np.concatenate([[0], box])) == 1)]
    truth = {
        "active": frac[4] > 0.5,
        "brain": frac[1:].sum(0) > 0.5,
        "onsets": onsets,
        "durations": np.full(len(onsets), block_dyn * tr),
    }
    return Phantom(
        "brain_fmri_block", data.astype(np.float32), truth, dict(kind="fMRI", tr=tr, times=t, grid=grid)
    )


# ── 3D FLAIR pair, SWI/EPI and multi-echo GRE (1.5 mm isotropic) ───────────────
# classes: bg, CSF, GM, WM, lesion, vein
FLAIR_SIGNAL = (0.0, 40.0, 340.0, 270.0, 620.0, 270.0)


def _vein_axes() -> list[tuple[float, float, float, float]]:
    """Veins as columns along z: (x, y, z centre, half length) [mm]."""
    out = []
    for i in CENTRAL_VEIN_LESIONS:
        (cx, cy, cz), rad, _ = MS_LESIONS[i]
        out.append((cx, cy, cz, rad + 4.0))
    for i in MULTI_VEIN_LESIONS:
        (cx, cy, cz), rad, _ = MS_LESIONS[i]
        out += [(cx - 2.2, cy, cz, rad + 4.0), (cx + 2.2, cy, cz, rad + 4.0)]
    out.append((-30.0, 36.0, 22.0, 14.0))  # a medullary vein away from every lesion
    return out


def _head_class(time_point: int, veins: bool) -> ClassFn:
    def f(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
        lab, _ = anatomy(x, y, z)
        c = lab.astype(np.int8).copy()
        for m in ms_lesions(x, y, z, time_point):
            c[m & (lab != BG)] = 4
        if veins:
            for vx, vy, vz, h in _vein_axes():
                c[((x - vx) ** 2 + (y - vy) ** 2 <= 0.8**2) & (np.abs(z - vz) <= h) & (lab != BG)] = 5
        return c

    return f


def _lesion_truth(grid: Grid, time_point: int) -> list[np.ndarray]:
    masks = []
    for k, (_, *radii) in enumerate(MS_LESIONS):
        if radii[time_point] <= 0:
            masks.append(np.zeros(grid.shape, bool))
            continue

        def one(x: np.ndarray, y: np.ndarray, z: np.ndarray, k: int = k) -> np.ndarray:
            return ms_lesions(x, y, z, time_point)[k].astype(np.int8)

        masks.append(fractions(grid, one, 2)[1] >= 0.5)
    return masks


def make_brain_flair_pair(snr: float = 40.0, seed: int = 27, grid: Grid = GRID_3D) -> tuple[Phantom, Phantom]:
    gen = rng(seed)
    out = []
    for tp, name in ((0, "brain_flair_baseline"), (1, "brain_flair_followup")):
        frac = fractions(grid, _head_class(tp, veins=False), 6, sub=(2, 2, 2))
        img = np.einsum("czyx,c->zyx", frac, np.array(FLAIR_SIGNAL))
        vox_ml = grid.pixel_mm**2 * grid.slice_mm / 1000.0
        les = _lesion_truth(grid, tp)
        out.append(
            Phantom(
                name,
                add_rician(img, 300.0 / snr, gen).astype(np.float32)[..., None],
                dict(
                    volumes_vox=np.array([int(m.sum()) for m in les]),
                    volumes_ml=np.array([m.sum() * vox_ml for m in les]),
                    labels=majority(frac),
                    slice_z_mm=grid.z_mm(),
                ),
                dict(kind="FLAIR", grid=grid),
            )
        )
    return out[0], out[1]


SWI_SIGNAL = (0.0, 520.0, 340.0, 420.0, 540.0, 60.0)


def make_brain_swi(
    snr: float = 60.0,
    shift_mm: tuple[float, float, float] = (0.0, 2.25, -1.5),
    seed: int = 28,
    grid: Grid = GRID_3D,
) -> Phantom:
    """T2*-weighted SWI/EPI of the baseline head with veins, displaced by shift_mm (z, y, x)."""
    from scipy.ndimage import shift as nd_shift

    gen = rng(seed)
    frac = fractions(grid, _head_class(0, veins=True), 6, sub=(2, 2, 2))
    img = np.einsum("czyx,c->zyx", frac, np.array(SWI_SIGNAL))
    shift_vox = (shift_mm[0] / grid.slice_mm, shift_mm[1] / grid.pixel_mm, shift_mm[2] / grid.pixel_mm)
    moved = nd_shift(img, shift_vox, order=1, mode="constant", cval=0.0)
    data = add_rician(moved, 400.0 / snr, gen)
    les = _lesion_truth(grid, 0)
    return Phantom(
        "brain_swi_epi",
        data.astype(np.float32)[..., None],
        dict(
            brain=frac[1:].sum(0) > 0.5,
            veins=frac[5] > 0.25,
            lesions=np.stack(les),
            central_vein=np.array(
                [i in CENTRAL_VEIN_LESIONS and MS_LESIONS[i][1] > 0 for i in range(len(MS_LESIONS))]
            ),
            multiple_veins=np.array(
                [i in MULTI_VEIN_LESIONS and MS_LESIONS[i][1] > 0 for i in range(len(MS_LESIONS))]
            ),
            shift_mm=np.array(shift_mm),
            shift_vox=np.array(shift_vox),
        ),
        dict(kind="SWI", te_ms=30.0, tr_ms=3000.0, grid=grid),
    )


# classes: bg, CSF, GM, WM, lesion, vein
ECHO_S0 = (0.0, 1200.0, 1000.0, 860.0, 1100.0, 860.0)
ECHO_T2S_MS = (1.0, 300.0, 52.0, 45.0, 70.0, 12.0)


def make_brain_multi_echo(
    te_ms: tuple[float, ...] = (5.0, 10.0, 15.0, 20.0),
    snr: float = 100.0,
    seed: int = 29,
    grid: Grid = GRID_3D,
) -> Phantom:
    gen = rng(seed)
    frac = fractions(grid, _head_class(0, veins=True), 6, sub=(2, 2, 2))
    te = np.asarray(te_ms)
    sig = np.array([s * np.exp(-te / t2) for s, t2 in zip(ECHO_S0, ECHO_T2S_MS, strict=True)])
    clean = mix(frac, sig)
    data = add_rician(clean, 1000.0 / snr, gen)
    return Phantom(
        "brain_multi_echo_gre",
        data.astype(np.float32),
        dict(
            brain=frac[1:].sum(0) > 0.5,
            labels=majority(frac),
            s0=np.array(ECHO_S0),
            t2star_ms=np.array(ECHO_T2S_MS),
            echo_sum=clean.sum(axis=-1),
        ),
        dict(kind="MULTI_ECHO", te_ms=te, tr_ms=40.0, flip_deg=20.0, grid=grid),
    )


__all__ = [
    "Grid",
    "anatomy",
    "fractions",
    "make_brain_dce_semiquant",
    "make_brain_dsc",
    "make_brain_dti",
    "make_brain_flair_pair",
    "make_brain_fmri",
    "make_brain_ivim",
    "make_brain_multi_echo",
    "make_brain_swi",
    "make_brain_tofts",
]
