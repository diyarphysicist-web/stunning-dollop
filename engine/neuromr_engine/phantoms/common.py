"""Shared helpers for phantom generation."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Phantom:
    """A synthetic acquisition plus its ground truth.

    data: array shaped (z, y, x, n) where n is dynamics, b-values, echoes, or 1.
    truth: maps and scalars known by construction, keyed by parameter name.
    meta: acquisition parameters needed to write DICOM and to analyse the data.
    """

    name: str
    data: np.ndarray
    truth: dict[str, np.ndarray | float]
    meta: dict = field(default_factory=dict)


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def add_rician(signal: np.ndarray, sigma: float, gen: np.random.Generator) -> np.ndarray:
    """Magnitude of signal plus complex Gaussian noise with per-channel SD sigma."""
    re = signal + gen.normal(0.0, sigma, signal.shape)
    im = gen.normal(0.0, sigma, signal.shape)
    return np.sqrt(re * re + im * im)


def gamma_variate(t: np.ndarray, t0: float, alpha: float, beta: float, k: float = 1.0) -> np.ndarray:
    """K (t - t0)^alpha exp(-(t - t0)/beta) for t > t0, else 0."""
    dt = np.clip(t - t0, 0.0, None)
    out = k * np.power(dt, alpha) * np.exp(-dt / beta)
    out[t <= t0] = 0.0
    return out


def block_labels(shape: tuple[int, int, int], n_classes: int) -> np.ndarray:
    """Split the in-plane field into n vertical stripes inside a circular 'brain' mask.

    Returns int labels: -1 background, 0..n-1 tissue classes. Every slice is identical so
    that per-class voxel counts are large and analysis is easy to verify.
    """
    nz, ny, nx = shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    cy, cx = (ny - 1) / 2, (nx - 1) / 2
    inside = ((yy - cy) / (0.45 * ny)) ** 2 + ((xx - cx) / (0.45 * nx)) ** 2 <= 1.0
    stripe = np.minimum((xx * n_classes) // nx, n_classes - 1)
    lab2d = np.where(inside, stripe, -1)
    return np.broadcast_to(lab2d, (nz, ny, nx)).copy()
