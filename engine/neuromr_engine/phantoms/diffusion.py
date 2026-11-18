"""Diffusion phantoms: DTI with known tensors (DIF-010) and IVIM/DKI (ADV-012)."""

from __future__ import annotations

import numpy as np

from .common import Phantom, add_rician, block_labels, rng


def gradient_directions(n: int) -> np.ndarray:
    """n unit vectors spread on the hemisphere by a Fibonacci lattice (deterministic)."""
    if n == 6:
        g = np.array([[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, 1, -1], [1, 1, 0], [-1, 1, 0]], float)
        return g / np.linalg.norm(g, axis=1, keepdims=True)
    i = np.arange(n) + 0.5
    z = 1 - i / n  # hemisphere z in (0, 1]
    r = np.sqrt(1 - z * z)
    phi = np.pi * (1 + 5**0.5) * i
    return np.stack([r * np.cos(phi), r * np.sin(phi), z], axis=1)


def tensor(evals: tuple[float, float, float], e1: np.ndarray) -> np.ndarray:
    """Cylindrically symmetric tensor with principal axis e1."""
    e1 = e1 / np.linalg.norm(e1)
    helper = np.array([1.0, 0, 0]) if abs(e1[0]) < 0.9 else np.array([0, 1.0, 0])
    e2 = np.cross(e1, helper)
    e2 /= np.linalg.norm(e2)
    e3 = np.cross(e1, e2)
    v = np.stack([e1, e2, e3], axis=1)
    return v @ np.diag(evals) @ v.T


def fa_md(evals: np.ndarray) -> tuple[float, float]:
    md = float(np.mean(evals))
    fa = float(np.sqrt(1.5) * np.linalg.norm(evals - md) / np.linalg.norm(evals))
    return fa, md


def make_dti(
    n_dirs: int = 30,
    bvals: tuple[float, ...] = (0.0, 1000.0),
    snr: float | None = 30.0,
    shape: tuple[int, int, int] = (2, 40, 40),
    seed: int = 5,
) -> Phantom:
    """Classes: isotropic (GM/CSF-like) and anisotropic along x, y, z. data[..., k] per volume."""
    gen = rng(seed)
    dirs = gradient_directions(n_dirs)
    b_list, g_list = [], []
    for b in bvals:
        if b == 0:
            b_list.append(0.0)
            g_list.append(np.zeros(3))
        else:
            for g in dirs:
                b_list.append(b)
                g_list.append(g)
    bv, bvec = np.array(b_list), np.array(g_list)
    classes = [
        ((0.8e-3, 0.8e-3, 0.8e-3), np.array([1.0, 0, 0])),
        ((3.0e-3, 3.0e-3, 3.0e-3), np.array([1.0, 0, 0])),
        ((1.7e-3, 0.3e-3, 0.3e-3), np.array([1.0, 0, 0])),
        ((1.7e-3, 0.3e-3, 0.3e-3), np.array([0, 1.0, 0])),
        ((1.5e-3, 0.4e-3, 0.4e-3), np.array([0, 0, 1.0])),
    ]
    labels = block_labels(shape, len(classes))
    s0 = 1000.0
    data = np.zeros(shape + (len(bv),))
    fa_t, md_t, ad_t, rd_t = [], [], [], []
    for i, (ev, e1) in enumerate(classes):
        d = tensor(ev, e1)
        sig = s0 * np.exp(-bv * np.einsum("ki,ij,kj->k", bvec, d, bvec))
        data[labels == i] = sig
        fa, md = fa_md(np.array(ev))
        fa_t.append(fa)
        md_t.append(md)
        ad_t.append(ev[0])
        rd_t.append((ev[1] + ev[2]) / 2)
    if snr is not None:
        data = add_rician(data, s0 / snr, gen)
    return Phantom(
        f"dti_{n_dirs}dir_snr{snr or 'inf'}",
        data.astype(np.float32),
        dict(labels=labels, fa=np.array(fa_t), md=np.array(md_t), ad=np.array(ad_t), rd=np.array(rd_t)),
        dict(kind="DTI", bvals=bv, bvecs=bvec),
    )


def make_ivim_dki(
    bvals: tuple[float, ...] = (0, 10, 20, 50, 100, 200, 400, 600, 800, 1000, 1500, 2000),
    snr: float = 100.0,
    shape: tuple[int, int, int] = (2, 40, 40),
    seed: int = 6,
) -> Phantom:
    """Isotropic signal S = S0[(1-f) exp(-bD + b²D²K/6) + f exp(-bD*)]; trace-weighted volumes."""
    gen = rng(seed)
    b = np.asarray(bvals, float)
    classes = [
        dict(d=0.8e-3, f=0.05, dstar=20e-3, k=0.8),
        dict(d=1.2e-3, f=0.10, dstar=15e-3, k=0.5),
        dict(d=0.6e-3, f=0.15, dstar=30e-3, k=1.2),
        dict(d=2.0e-3, f=0.02, dstar=10e-3, k=0.2),
    ]
    labels = block_labels(shape, len(classes))
    s0 = 1000.0
    data = np.zeros(shape + (len(b),))
    for i, c in enumerate(classes):
        tissue = np.exp(-b * c["d"] + (b * c["d"]) ** 2 * c["k"] / 6.0)
        data[labels == i] = s0 * ((1 - c["f"]) * tissue + c["f"] * np.exp(-b * c["dstar"]))
    data = add_rician(data, s0 / snr, gen)
    truth: dict[str, np.ndarray | float] = {"labels": labels}
    for key in ("d", "f", "dstar", "k"):
        truth[key] = np.array([c[key] for c in classes])
    return Phantom("ivim_dki", data.astype(np.float32), truth, dict(kind="DWI", bvals=b))
