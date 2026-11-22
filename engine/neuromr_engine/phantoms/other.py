"""fMRI block, MRS spectra, longitudinal FLAIR, SWI/EPI (FLAIR*) and multi-echo GRE phantoms."""

from __future__ import annotations

import numpy as np
from scipy.stats import gamma as gamma_dist

from .common import Phantom, add_rician, rng

# --- fMRI (FMRI-015) -------------------------------------------------------------------


def hrf(t: np.ndarray) -> np.ndarray:
    """Canonical double-gamma HRF (shapes 6 and 16, undershoot ratio 1/6), unit peak."""
    h = gamma_dist.pdf(t, 6.0) - gamma_dist.pdf(t, 16.0) / 6.0
    return h / h.max()


def make_fmri(
    snr: float = 100.0,
    tr: float = 2.0,
    n_dyn: int = 100,
    block_dyn: int = 10,
    shape: tuple[int, int, int] = (6, 48, 48),
    seed: int = 7,
    amplitude: float = 0.03,
) -> Phantom:
    """Rest/task blocks of `block_dyn` dynamics starting with rest. Three spherical blobs.

    Ground truth: binary activation mask and the paradigm onsets/durations [s].
    """
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    box = ((np.arange(n_dyn) // block_dyn) % 2 == 1).astype(float)
    fine = np.arange(0, 32, tr)
    reg = np.convolve(box, hrf(fine))[:n_dyn]
    reg /= reg.max()
    nz, ny, nx = shape
    zz, yy, xx = np.mgrid[0:nz, 0:ny, 0:nx]
    brain = ((yy - ny / 2) / (0.45 * ny)) ** 2 + ((xx - nx / 2) / (0.45 * nx)) ** 2 <= 1
    active = np.zeros(shape, bool)
    for cz, cy, cx in ((2, 16, 16), (3, 30, 32), (4, 18, 34)):
        active |= (zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2 <= 9
    s0 = 1000.0
    base = np.where(brain, s0, 0.0)[..., None] * np.ones(n_dyn)
    base[active] *= 1 + amplitude * reg
    data = add_rician(base, s0 / snr, gen)
    onsets = t[np.flatnonzero(np.diff(np.concatenate([[0], box])) == 1)]
    return Phantom(
        "fmri_block",
        data.astype(np.float32),
        dict(
            active=active,
            brain=np.broadcast_to(brain, shape).copy(),
            onsets=onsets,
            durations=np.full(len(onsets), block_dyn * tr),
        ),
        dict(kind="fMRI", tr=tr, times=t),
    )


# --- MRS (MRS-014) ---------------------------------------------------------------------

# Singlet approximations at 3 T for the phantom (ppm, relative protons).
METABOLITES = {"NAA": (2.01, 3), "Cr": (3.03, 3), "Cho": (3.21, 9), "mI": (3.56, 6), "Cr2": (3.92, 2)}


def make_svs(
    amplitudes: dict[str, float] | None = None,
    fwhm_hz: float = 6.0,
    snr: float = 40.0,
    n: int = 2048,
    bw_hz: float = 2000.0,
    f0_mhz: float = 127.8,
    seed: int = 8,
) -> Phantom:
    """Single-voxel FID (time domain, complex) with Lorentzian lines. data shape (n,)."""
    gen = rng(seed)
    amps = amplitudes or {"NAA": 10.0, "Cr": 8.0, "Cho": 3.0, "mI": 5.0, "Cr2": 4.0}
    t = np.arange(n) / bw_hz
    ref_ppm = 4.7
    fid = np.zeros(n, complex)
    lw = np.pi * fwhm_hz
    for name, a in amps.items():
        ppm, _ = METABOLITES[name]
        f = (ppm - ref_ppm) * f0_mhz
        fid += a * np.exp(2j * np.pi * f * t) * np.exp(-lw * t)
    peak = max(amps.values()) * n / (lw * 2 * n / bw_hz)  # approx. FD peak height scale
    sigma = peak / snr / np.sqrt(n)
    fid += gen.normal(0, sigma, n) + 1j * gen.normal(0, sigma, n)
    return Phantom(
        "mrs_svs",
        fid.astype(np.complex64),
        {k: float(v) for k, v in amps.items()},
        dict(kind="MRS-SVS", bw_hz=bw_hz, f0_mhz=f0_mhz, fwhm_hz=fwhm_hz, ref_ppm=ref_ppm),
    )


# --- Longitudinal FLAIR (LBA-043) ------------------------------------------------------

HEAD_SHAPE = (32, 64, 64)  # (z, y, x), 1 mm isotropic; shared by FLAIR, SWI/EPI and multi-echo phantoms

# Centre (z, y, x), baseline radius, follow-up radius in voxels (0 = absent).
# Changes: grow, shrink, stable, new, disappear.
FLAIR_LESIONS: tuple[tuple[tuple[int, int, int], float, float], ...] = (
    ((12, 22, 22), 3.0, 4.0),
    ((16, 40, 24), 4.0, 3.0),
    ((20, 24, 42), 3.0, 3.0),
    ((14, 42, 42), 0.0, 3.0),
    ((22, 32, 32), 2.5, 0.0),
)


def _head(shape: tuple[int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    """Ellipsoidal brain mask and the (z, y, x) index grids."""
    nz, ny, nx = shape
    grid = np.mgrid[0:nz, 0:ny, 0:nx]
    zz, yy, xx = grid
    brain = ((zz - nz / 2) / (0.45 * nz)) ** 2 + ((yy - ny / 2) / (0.45 * ny)) ** 2 + (
        (xx - nx / 2) / (0.45 * nx)
    ) ** 2 <= 1
    return brain, grid


def _lesion_masks(shape: tuple[int, int, int], time_point: int) -> list[np.ndarray]:
    """One mask per FLAIR_LESIONS entry at time point 0 (baseline) or 1 (follow-up)."""
    brain, (zz, yy, xx) = _head(shape)
    masks = []
    for (cz, cy, cx), *radii in FLAIR_LESIONS:
        r = radii[time_point]
        if r > 0:
            masks.append(((zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2 <= r * r) & brain)
        else:
            masks.append(np.zeros(shape, bool))
    return masks


def make_flair_pair(
    shape: tuple[int, int, int] = HEAD_SHAPE,
    snr: float = 40.0,
    seed: int = 9,
) -> tuple[Phantom, Phantom]:
    """Baseline and follow-up FLAIR with spherical lesions of known radii (voxels).

    Lesion changes: grow, shrink, stable, new, disappear. Truth volumes are voxel counts.
    """
    gen = rng(seed)
    brain, _ = _head(shape)

    def volume(r_idx: int) -> tuple[np.ndarray, list[int]]:
        img = np.where(brain, 300.0, 0.0)
        counts = []
        for m in _lesion_masks(shape, r_idx):
            img[m] = 600.0
            counts.append(int(m.sum()))
        return img, counts

    base, vb = volume(0)
    foll, vf = volume(1)
    sigma = 300.0 / snr
    pb = Phantom(
        "flair_baseline",
        add_rician(base, sigma, gen).astype(np.float32)[..., None],
        dict(volumes_vox=np.array(vb)),
        dict(kind="FLAIR"),
    )
    pf = Phantom(
        "flair_followup",
        add_rician(foll, sigma, gen).astype(np.float32)[..., None],
        dict(volumes_vox=np.array(vf)),
        dict(kind="FLAIR"),
    )
    return pb, pf


# --- SWI/EPI for FLAIR* (LBA-025) ------------------------------------------------------

# Baseline lesions that contain a central vein (indices into FLAIR_LESIONS).
CENTRAL_VEIN_LESIONS = (0, 2)


def make_swi_epi(
    shape: tuple[int, int, int] = HEAD_SHAPE,
    shift_vox: tuple[float, float, float] = (0.0, 1.5, -1.0),
    snr: float = 30.0,
    seed: int = 10,
) -> Phantom:
    """T2*-weighted SWI/EPI volume of the baseline head, for FLAIR* (LBA-025).

    Same grid and lesions as the baseline FLAIR. Veins are hypointense columns along z:
    one through the centre of each lesion in CENTRAL_VEIN_LESIONS, and one outside any lesion.
    The volume is displaced by `shift_vox` (z, y, x) relative to the FLAIR, so the in-session
    rigid registration has a known answer.

    Truth: veins and lesions masks in FLAIR space, per-lesion central-vein flags, the shift [voxels].
    """
    from scipy.ndimage import shift as nd_shift

    gen = rng(seed)
    brain, (zz, yy, xx) = _head(shape)
    lesions = _lesion_masks(shape, 0)
    lesion_any = np.any(lesions, axis=0)
    veins = np.zeros(shape, bool)
    for i in CENTRAL_VEIN_LESIONS:
        (cz, cy, cx), r, _ = FLAIR_LESIONS[i]
        reach = int(np.ceil(r)) + 2
        veins |= (yy == cy) & (xx == cx) & (np.abs(zz - cz) <= reach)
    veins |= (yy == 32) & (xx == 14) & (zz >= 6) & (zz <= 26)  # vein away from every lesion
    veins &= brain
    img = np.where(brain, 400.0, 0.0)
    img[lesion_any] = 480.0  # lesions mildly hyperintense on T2*-weighted EPI
    img[veins] = 80.0  # deoxygenated blood: strongly hypointense
    moved = nd_shift(img, shift_vox, order=1, mode="constant", cval=0.0)
    data = add_rician(moved, 400.0 / snr, gen)
    flags = np.array([i in CENTRAL_VEIN_LESIONS for i in range(len(FLAIR_LESIONS))])
    has_lesion = np.array([m.any() for m in lesions])
    return Phantom(
        "swi_epi",
        data.astype(np.float32)[..., None],
        dict(
            brain=brain,
            veins=veins,
            lesions=np.stack(lesions),
            central_vein=flags & has_lesion,
            shift_vox=np.array(shift_vox),
        ),
        dict(kind="SWI", te_ms=30.0, tr_ms=3000.0),
    )


# --- Multi-echo GRE (ECHO-002) ---------------------------------------------------------


def make_multi_echo(
    shape: tuple[int, int, int] = HEAD_SHAPE,
    te_ms: tuple[float, ...] = (5.0, 10.0, 15.0, 20.0),
    t2s_tissue_ms: float = 60.0,
    t2s_lesion_ms: float = 30.0,
    s0: float = 1000.0,
    snr: float = 100.0,
    seed: int = 11,
) -> Phantom:
    """Multi-echo gradient echo of the baseline head: S(TE) = S0 · exp(-TE / T2*).

    data shape (z, y, x, n_echoes). Noise SD = s0 / snr. Truth: S0 and T2* maps [ms], brain mask,
    and the noise-free voxelwise sum over all echoes (ECHO-002 with the default full range).
    """
    gen = rng(seed)
    brain, _ = _head(shape)
    lesion_any = np.any(_lesion_masks(shape, 0), axis=0)
    t2s = np.where(brain, t2s_tissue_ms, 0.0)
    t2s[lesion_any] = t2s_lesion_ms
    s0_map = np.where(brain, s0, 0.0)
    te = np.asarray(te_ms)
    with np.errstate(divide="ignore", invalid="ignore"):
        clean = s0_map[..., None] * np.exp(-te / np.where(brain, t2s, np.inf)[..., None])
    data = add_rician(clean, s0 / snr, gen)
    return Phantom(
        "multi_echo_gre",
        data.astype(np.float32),
        dict(brain=brain, s0=s0_map, t2star_ms=t2s, echo_sum=clean.sum(axis=-1)),
        dict(kind="MULTI_ECHO", te_ms=te, tr_ms=40.0, flip_deg=20.0),
    )
