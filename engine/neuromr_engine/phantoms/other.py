"""fMRI block, MRS spectra, and longitudinal FLAIR phantoms."""

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


def make_flair_pair(
    shape: tuple[int, int, int] = (32, 64, 64),
    snr: float = 40.0,
    seed: int = 9,
) -> tuple[Phantom, Phantom]:
    """Baseline and follow-up FLAIR with spherical lesions of known radii (voxels).

    Lesion changes: grow, shrink, stable, new, disappear. Truth volumes are voxel counts.
    """
    gen = rng(seed)
    nz, ny, nx = shape
    zz, yy, xx = np.mgrid[0:nz, 0:ny, 0:nx]
    brain = ((zz - nz / 2) / (0.45 * nz)) ** 2 + ((yy - ny / 2) / (0.45 * ny)) ** 2 + (
        (xx - nx / 2) / (0.45 * nx)
    ) ** 2 <= 1
    lesions = [  # centre, r_baseline, r_followup (0 = absent)
        ((12, 22, 22), 3.0, 4.0),
        ((16, 40, 24), 4.0, 3.0),
        ((20, 24, 42), 3.0, 3.0),
        ((14, 42, 42), 0.0, 3.0),
        ((22, 32, 32), 2.5, 0.0),
    ]

    def volume(r_idx: int) -> tuple[np.ndarray, list[int]]:
        img = np.where(brain, 300.0, 0.0)
        counts = []
        for (cz, cy, cx), *radii in lesions:
            r = radii[r_idx]
            m = (
                ((zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2 <= r * r) & brain
                if r > 0
                else np.zeros(shape, bool)
            )
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
