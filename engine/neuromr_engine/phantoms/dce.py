"""DCE phantoms.

make_dce_semiquant: piecewise curves with known semi-quantitative parameters (DCE-007).
make_tofts: Extended Tofts tissue with population AIF plus VFA reference series (PERM-011).
"""

from __future__ import annotations

import numpy as np

from .common import Phantom, block_labels, rng

# --- semi-quantitative ---------------------------------------------------------------


def piecewise_curve(t: np.ndarray, s0: float, t0: float, t1: float, s1: float, washout: float) -> np.ndarray:
    """Flat baseline s0 until t0, linear rise to s1 at t1, then linear slope `washout` [a.u./s]."""
    s = np.full_like(t, s0, dtype=float)
    rise = (t > t0) & (t <= t1)
    s[rise] = s0 + (s1 - s0) * (t[rise] - t0) / (t1 - t0)
    after = t > t1
    s[after] = s1 + washout * (t[after] - t1)
    return s


def make_dce_semiquant(
    noise_frac: float = 0.05,
    tr: float = 10.0,
    n_dyn: int = 12,
    shape: tuple[int, int, int] = (2, 48, 48),
    seed: int = 3,
) -> Phantom:
    """Classes vary arrival, peak time, enhancement and wash-out. Noise SD = noise_frac × S1."""
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    classes = [
        dict(s0=200.0, t0=15.0, t1=45.0, s1=500.0, washout=-1.5),
        dict(s0=200.0, t0=15.0, t1=65.0, s1=400.0, washout=0.0),
        dict(s0=300.0, t0=25.0, t1=55.0, s1=750.0, washout=-3.0),
        dict(s0=250.0, t0=15.0, t1=85.0, s1=450.0, washout=0.5),
    ]
    labels = block_labels(shape, len(classes))
    data = np.zeros(shape + (n_dyn,))
    for i, c in enumerate(classes):
        clean = piecewise_curve(t, **c)
        n = int((labels == i).sum())
        data[labels == i] = clean + gen.normal(0.0, noise_frac * c["s1"], (n, n_dyn))
    truth: dict[str, np.ndarray | float] = {"labels": labels}
    for key in ("s0", "t0", "t1", "s1", "washout"):
        truth[key] = np.array([c[key] for c in classes])
    truth["washin"] = np.array([(c["s1"] - c["s0"]) / (c["t1"] - c["t0"]) for c in classes])
    truth["maxenh"] = truth["s1"] - truth["s0"]
    truth["maxrelenh"] = (truth["s1"] / truth["s0"] - 1.0) * 100.0
    return Phantom(
        "dce_semiquant", np.clip(data, 0, None).astype(np.float32), truth, dict(kind="DCE", tr=tr, times=t)
    )


# --- Extended Tofts --------------------------------------------------------------------

WEINMANN_A = (3.99, 4.78)  # kg/l
WEINMANN_M = (0.144, 0.0111)  # 1/min


def population_aif(t_s: np.ndarray, dose: float = 0.1, t0: float = 30.0, boxcar_s: float = 7.5) -> np.ndarray:
    """Weinmann bi-exponential plasma curve [mmol/l] convolved with an injection boxcar."""
    tm = np.clip(t_s - t0, 0, None) / 60.0
    cp = dose * (WEINMANN_A[0] * np.exp(-WEINMANN_M[0] * tm) + WEINMANN_A[1] * np.exp(-WEINMANN_M[1] * tm))
    cp[t_s < t0] = 0.0
    if boxcar_s > 0:
        dt = float(t_s[1] - t_s[0])
        k = max(1, int(round(boxcar_s / dt)))
        cp = np.convolve(cp, np.ones(k) / k)[: len(cp)]
    return cp


def tofts_tissue(t_s: np.ndarray, cp: np.ndarray, ktrans: float, kep: float, vp: float) -> np.ndarray:
    """Extended Tofts on a uniform grid (rates in 1/min)."""
    dt_min = float(t_s[1] - t_s[0]) / 60.0
    kernel = np.exp(-kep * (t_s - t_s[0]) / 60.0)
    return vp * cp + ktrans * np.convolve(cp, kernel)[: len(cp)] * dt_min


def spgr(m0: float, t1_ms: float, tr_ms: float, fa_deg: float) -> float:
    e1 = np.exp(-tr_ms / t1_ms)
    a = np.deg2rad(fa_deg)
    return m0 * np.sin(a) * (1 - e1) / (1 - e1 * np.cos(a))


def make_tofts(
    snr: float = 50.0,
    dt: float = 4.0,
    n_dyn: int = 60,
    shape: tuple[int, int, int] = (2, 48, 48),
    seed: int = 4,
    tr_ms: float = 4.0,
    fa_dce: float = 15.0,
    vfa: tuple[float, float] = (5.0, 15.0),
    r1: float = 4.5,
) -> Phantom:
    """DCE + VFA references. Truth: ktrans, kep, ve, vp per class, T1 map, AIF."""
    gen = rng(seed)
    t = np.arange(n_dyn) * dt
    fine = np.arange(0, t[-1] + 0.5, 0.5)
    cp_f = population_aif(fine)
    classes = [
        dict(ktrans=0.05, ve=0.20, vp=0.02, t1=1200.0),
        dict(ktrans=0.10, ve=0.30, vp=0.05, t1=1400.0),
        dict(ktrans=0.20, ve=0.40, vp=0.03, t1=1000.0),
        dict(ktrans=0.30, ve=0.50, vp=0.08, t1=1600.0),
    ]
    labels = block_labels(shape, len(classes))
    m0 = 3000.0
    dce = np.zeros(shape + (n_dyn,))
    refs = {fa: np.zeros(shape + (1,)) for fa in vfa}
    for i, c in enumerate(classes):
        kep = c["ktrans"] / c["ve"]
        ct = np.interp(t, fine, tofts_tissue(fine, cp_f, c["ktrans"], kep, c["vp"]))
        r1t = 1000.0 / c["t1"] + r1 * ct  # 1/s
        sig = np.array([spgr(m0, 1000.0 / r, tr_ms, fa_dce) for r in r1t])
        dce[labels == i] = sig
        for fa in vfa:
            refs[fa][labels == i] = spgr(m0, c["t1"], tr_ms, fa)
    sigma = spgr(m0, 1200.0, tr_ms, fa_dce) / snr
    dce = np.abs(dce + gen.normal(0, sigma, dce.shape))
    refs = {fa: np.abs(v + gen.normal(0, sigma, v.shape)).astype(np.float32) for fa, v in refs.items()}
    truth: dict[str, np.ndarray | float] = {"labels": labels, "aif_cp": np.interp(t, fine, cp_f)}
    for key in ("ktrans", "ve", "vp", "t1"):
        truth[key] = np.array([c[key] for c in classes])
    truth["kep"] = truth["ktrans"] / truth["ve"]
    return Phantom(
        "dce_tofts",
        dce.astype(np.float32),
        truth,
        dict(kind="DCE", times=t, tr_ms=tr_ms, fa=fa_dce, r1=r1, references=refs, field_t=3.0),
    )
