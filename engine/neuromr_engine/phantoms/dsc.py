"""DSC perfusion phantom (DSC-031/032, ALGORITHMS.md §2.6).

Tissue concentration follows the indicator-dilution model
    C_t(t) = CBF * (AIF ⊗ R)(t),  R(t) = exp(-t / MTT),  CBV = CBF * MTT,
with a gamma-variate arterial input. Signal: S = S0 * exp(-TE * k * C).

Ground truth per tissue class:
    cbf [ml/100g/min], cbv [ml/100g], mtt [s] (residue mean transit time),
    t0 [s] (tissue arrival), ttp [s], first_moment [s] (first moment of C_t from arrival;
    this is what non-deconvolution methods report as MTT), area (∫ΔR2* dt).
Leakage variant: ΔR2*_voxel = K1 * Rbar(t) - K2 * ∫Rbar, with K1, K2 known per class.
"""

from __future__ import annotations

import numpy as np

from .common import Phantom, add_rician, block_labels, gamma_variate, rng

TE_S = 0.030
S0 = 1000.0
# Scale from concentration (arbitrary) to ΔR2* [1/s]; chosen so the AIF peak signal drop is ~60 %.
K_R2 = 1.0


def aif_curve(t: np.ndarray, t0: float = 10.0) -> np.ndarray:
    """Arterial ΔR2* [1/s] — gamma variate with peak ≈ 30 1/s at t0 + 4.5 s."""
    c = gamma_variate(t, t0, alpha=3.0, beta=1.5)
    return 30.0 * c / c.max()


def tissue_curve(t: np.ndarray, aif: np.ndarray, cbf: float, mtt: float) -> np.ndarray:
    """ΔR2* of tissue for CBF [ml/100g/min] and MTT [s] on a uniform time grid t.

    Callers pass the 0.05 s fine grid so the ground truth does not depend on the
    acquisition's sampling interval.
    """
    dt = float(t[1] - t[0])
    resid = np.exp(-t / mtt)
    flow = cbf / 6000.0  # ml/100g/min -> ml/ml/s (tissue density ~1 for the phantom)
    return flow * np.convolve(aif, resid)[: len(t)] * dt


def _fine_aif(t_end: float, t0: float) -> tuple[np.ndarray, np.ndarray]:
    tf = np.arange(0.0, t_end + 0.05, 0.05)
    return tf, aif_curve(tf, t0)


def make_dsc(
    snr: float = 50.0,
    tr: float = 2.1,
    n_dyn: int = 60,
    shape: tuple[int, int, int] = (4, 64, 64),
    seed: int = 1,
    cbf_levels: tuple[float, ...] = (20.0, 40.0, 60.0),
    mtt_levels: tuple[float, ...] = (2.0, 4.0, 6.0, 8.0, 12.0),
) -> Phantom:
    """Grid of (CBF, MTT) classes; every in-mask voxel belongs to exactly one class."""
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    classes = [(f, m) for f in cbf_levels for m in mtt_levels]
    labels = block_labels(shape, len(classes))
    tf, aif_f = _fine_aif(t[-1], t0=10.0)

    curves = []
    truth_rows = []
    for cbf, mtt in classes:
        c_f = tissue_curve(tf, aif_f, cbf, mtt)
        area = float(np.trapezoid(c_f, tf))
        arrival = float(tf[np.argmax(c_f > 1e-6 * c_f.max())])
        fm = float(np.trapezoid((tf - arrival) * c_f, tf) / area)
        truth_rows.append(
            dict(
                cbf=cbf,
                cbv=cbf * mtt / 60.0,
                mtt=mtt,
                t0=arrival,
                ttp=float(tf[np.argmax(c_f)]),
                first_moment=fm,
                area=area,
            )
        )
        curves.append(np.interp(t, tf, c_f))
    curves = np.asarray(curves)  # (n_class, n_dyn)

    signal = np.zeros(shape + (n_dyn,))  # background stays 0 before noise
    for i in range(len(classes)):
        signal[labels == i] = S0 * np.exp(-TE_S * K_R2 * curves[i])
    noisy = add_rician(signal, S0 / snr, gen)

    truth: dict[str, np.ndarray | float] = {"labels": labels}
    for key in truth_rows[0]:
        truth[key] = np.array([r[key] for r in truth_rows])
    truth["aif_dr2"] = aif_curve(t, 10.0)
    return Phantom(
        name=f"dsc_snr{int(snr)}_tr{tr:.1f}",
        data=noisy.astype(np.float32),
        truth=truth,
        meta=dict(kind="DSC", te=TE_S, tr=tr, times=t, s0=S0, snr=snr),
    )


def make_dsc_leakage(
    snr: float = 50.0,
    tr: float = 1.5,
    n_dyn: int = 80,
    shape: tuple[int, int, int] = (2, 64, 64),
    seed: int = 2,
    k1_levels: tuple[float, ...] = (0.8, 1.0, 1.5),
    k2_levels_per_min: tuple[float, ...] = (-0.02, 0.0, 0.02, 0.05),
) -> Phantom:
    """Leakage phantom: ΔR2* = K1·Rbar − K2·∫Rbar. Class 0 is pure reference (K1=1, K2=0).

    K2 truth is in 1/min; the forward model converts to 1/s.
    """
    gen = rng(seed)
    t = np.arange(n_dyn) * tr
    tf, aif_f = _fine_aif(t[-1], t0=12.0)
    rbar_f = tissue_curve(tf, aif_f, 50.0, 4.0)
    rbar = np.interp(t, tf, rbar_f)
    cum = np.concatenate([[0.0], np.cumsum(0.5 * (rbar[1:] + rbar[:-1]) * np.diff(t))])
    classes = [(1.0, 0.0)] + [(k1, k2) for k1 in k1_levels for k2 in k2_levels_per_min]
    labels = block_labels(shape, len(classes))
    # Make the reference class dominant (half the mask) so it is selected as non-enhancing.
    ref_mask = (labels >= 0) & (np.indices(shape)[2] < shape[2] // 2)
    labels = np.where(ref_mask, 0, np.where(labels >= 0, 1 + (labels % (len(classes) - 1)), -1))

    signal = np.zeros(shape + (n_dyn,))
    for i, (k1, k2) in enumerate(classes):
        dr2 = k1 * rbar - (k2 / 60.0) * cum
        signal[labels == i] = S0 * np.exp(-TE_S * dr2)
    noisy = add_rician(signal, S0 / snr, gen)
    return Phantom(
        name=f"dsc_leakage_snr{int(snr)}",
        data=noisy.astype(np.float32),
        truth=dict(
            labels=labels,
            k1=np.array([c[0] for c in classes]),
            k2=np.array([c[1] for c in classes]),
            rbar=rbar,
        ),
        meta=dict(kind="DSC", te=TE_S, tr=tr, times=t, s0=S0, snr=snr),
    )
