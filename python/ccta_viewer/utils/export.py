"""Snapshot and cine export helpers."""

from __future__ import annotations

import os
from typing import Iterable

import numpy as np


def export_png(array: np.ndarray, path: str) -> None:
    import imageio.v2 as imageio
    imageio.imwrite(path, np.ascontiguousarray(array))


def export_mp4(frames: Iterable[np.ndarray], path: str, fps: int = 24) -> None:
    """Write a stack of HxW or HxWx3 uint8 frames as an MP4 file."""
    import imageio.v2 as imageio

    writer = imageio.get_writer(path, fps=fps, codec="libx264", quality=8)
    try:
        for f in frames:
            if f.ndim == 2:
                f = np.stack([f] * 3, axis=-1)
            if f.dtype != np.uint8:
                f = np.clip(f, 0, 255).astype(np.uint8)
            writer.append_data(f)
    finally:
        writer.close()


def export_gif(frames: Iterable[np.ndarray], path: str, fps: int = 12) -> None:
    import imageio.v2 as imageio
    imageio.mimsave(path, [np.ascontiguousarray(f) for f in frames], fps=fps)


def ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
