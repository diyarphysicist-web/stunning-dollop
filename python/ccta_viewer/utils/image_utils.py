"""Numpy <-> Qt image conversions."""

from __future__ import annotations

import numpy as np

try:
    from PyQt5.QtGui import QImage
except ImportError:  # pragma: no cover - PyQt is optional for headless tests
    QImage = None  # type: ignore[assignment]


def to_qimage(array: np.ndarray) -> "QImage":
    """Convert an HxW uint8 grayscale or HxWx3/4 image into a QImage.

    The returned QImage holds a copy of the data so the source array
    can be freed safely.
    """
    if QImage is None:
        raise RuntimeError("PyQt5 is not installed")
    if array.dtype != np.uint8:
        array = np.clip(array, 0, 255).astype(np.uint8)
    array = np.ascontiguousarray(array)
    if array.ndim == 2:
        h, w = array.shape
        qi = QImage(array.data, w, h, w, QImage.Format_Grayscale8)
    elif array.ndim == 3 and array.shape[2] == 3:
        h, w, _ = array.shape
        qi = QImage(array.data, w, h, w * 3, QImage.Format_RGB888)
    elif array.ndim == 3 and array.shape[2] == 4:
        h, w, _ = array.shape
        qi = QImage(array.data, w, h, w * 4, QImage.Format_RGBA8888)
    else:
        raise ValueError(f"Unsupported array shape {array.shape}")
    return qi.copy()


def qimage_to_numpy(qimage: "QImage") -> np.ndarray:
    if QImage is None:
        raise RuntimeError("PyQt5 is not installed")
    qimage = qimage.convertToFormat(QImage.Format_RGBA8888)
    w, h = qimage.width(), qimage.height()
    ptr = qimage.bits()
    ptr.setsize(h * w * 4)
    return np.frombuffer(ptr, np.uint8).reshape(h, w, 4).copy()


def overlay_color(
    gray: np.ndarray,
    mask: np.ndarray,
    rgb: tuple[int, int, int] = (255, 80, 80),
    alpha: float = 0.4,
) -> np.ndarray:
    """Blend a binary ``mask`` over an 8-bit grayscale image."""
    if gray.dtype != np.uint8:
        gray = np.clip(gray, 0, 255).astype(np.uint8)
    rgb_img = np.stack([gray, gray, gray], axis=-1).astype(np.float32)
    mask_b = mask.astype(bool)
    color = np.array(rgb, dtype=np.float32)
    rgb_img[mask_b] = (1 - alpha) * rgb_img[mask_b] + alpha * color
    return rgb_img.astype(np.uint8)
