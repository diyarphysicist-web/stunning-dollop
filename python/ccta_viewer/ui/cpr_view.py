"""Curved Planar Reformation panel.

Shows a stretched CPR for the active centerline plus a perpendicular
cross-section under the cursor. Includes a rotation slider so the
reader can spin around the vessel.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pyqtgraph as pg
from PyQt5 import QtCore, QtWidgets

from ..core.cpr import CurvedPlanarReformatter
from ..core.centerline import Centerline
from ..core.volume import Volume
from ..core.windowing import WindowLevel, apply_window
from ..core.measurements import diameter_from_lumen


class CPRView(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._volume: Optional[Volume] = None
        self._centerline: Optional[Centerline] = None
        self._reformat: Optional[CurvedPlanarReformatter] = None
        self._cpr_image: Optional[np.ndarray] = None
        self.window_level = WindowLevel(700, 200, "Coronary")
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        controls = QtWidgets.QToolBar()
        controls.setStyleSheet("QToolBar { background: #142033; }")
        self.rotation = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.rotation.setRange(0, 359)
        self.rotation.setValue(0)
        self.rotation.valueChanged.connect(self._refresh)
        self.rotation.setFixedWidth(220)
        controls.addWidget(QtWidgets.QLabel(" Rotation "))
        controls.addWidget(self.rotation)

        self.width_spin = QtWidgets.QSpinBox()
        self.width_spin.setRange(10, 100)
        self.width_spin.setValue(30)
        self.width_spin.setSuffix(" mm")
        self.width_spin.valueChanged.connect(self._refresh)
        controls.addWidget(QtWidgets.QLabel(" Width "))
        controls.addWidget(self.width_spin)

        self.length_label = QtWidgets.QLabel("")
        self.length_label.setStyleSheet("color: #cfe1ff;")
        controls.addWidget(self.length_label)
        layout.addWidget(controls)

        splitter = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        layout.addWidget(splitter)

        self.cpr_widget = pg.GraphicsLayoutWidget()
        self.cpr_widget.setBackground("#0a0e15")
        vb1 = self.cpr_widget.addViewBox(invertY=True, lockAspect=True)
        self.cpr_image_item = pg.ImageItem(axisOrder="row-major")
        vb1.addItem(self.cpr_image_item)
        self.cpr_marker = pg.InfiniteLine(angle=0, pen=pg.mkPen("#ffaa33", width=1))
        vb1.addItem(self.cpr_marker, ignoreBounds=True)
        self.cpr_viewbox = vb1
        self.cpr_widget.scene().sigMouseMoved.connect(self._on_mouse_moved)
        splitter.addWidget(self.cpr_widget)

        right = QtWidgets.QWidget()
        right_layout = QtWidgets.QVBoxLayout(right)
        right_layout.setContentsMargins(2, 2, 2, 2)

        self.cs_widget = pg.GraphicsLayoutWidget()
        self.cs_widget.setBackground("#0a0e15")
        vb2 = self.cs_widget.addViewBox(invertY=True, lockAspect=True)
        self.cs_image_item = pg.ImageItem(axisOrder="row-major")
        vb2.addItem(self.cs_image_item)
        right_layout.addWidget(self.cs_widget)

        self.diameter_label = QtWidgets.QLabel("Diameter: —")
        self.diameter_label.setStyleSheet("color: #cfe1ff;")
        right_layout.addWidget(self.diameter_label)
        splitter.addWidget(right)
        splitter.setStretchFactor(0, 3)
        splitter.setStretchFactor(1, 1)

    # ------------------------------------------------------------------
    def set_volume(self, volume: Volume) -> None:
        self._volume = volume
        self._reformat = CurvedPlanarReformatter(volume) if volume else None
        self._refresh()

    def set_centerline(self, centerline: Optional[Centerline]) -> None:
        self._centerline = centerline
        self._refresh()

    def set_window_level(self, wl: WindowLevel) -> None:
        self.window_level = wl
        self._refresh()

    def _refresh(self) -> None:
        if not self._reformat or not self._centerline:
            self.cpr_image_item.clear()
            self.cs_image_item.clear()
            self.length_label.setText("")
            return
        res = self._reformat.stretched_cpr(
            self._centerline,
            width_mm=float(self.width_spin.value()),
            pixel_mm=0.3,
            rotation_deg=float(self.rotation.value()),
        )
        img = apply_window(res.image, self.window_level)
        self._cpr_image = img
        self.cpr_image_item.setImage(img, autoLevels=False)
        self.length_label.setText(
            f"Vessel length: {res.arc_length_mm:.1f} mm  "
            f"({self._centerline.n_points} points)"
        )

    def _on_mouse_moved(self, pos) -> None:
        if not self._reformat or not self._centerline or self._cpr_image is None:
            return
        if not self.cpr_viewbox.sceneBoundingRect().contains(pos):
            return
        p = self.cpr_viewbox.mapSceneToView(pos)
        row = int(p.y())
        if not (0 <= row < self._cpr_image.shape[0]):
            return
        self.cpr_marker.setPos(row + 0.5)
        cs = self._reformat.cross_section(
            self._centerline, row, size_mm=20.0, pixel_mm=0.2
        )
        cs_img = apply_window(cs, self.window_level)
        self.cs_image_item.setImage(cs_img, autoLevels=False)
        d_min, d_eq, d_max = diameter_from_lumen(cs, pixel_mm=0.2)
        self.diameter_label.setText(
            f"Diameter ≈ min {d_min:.1f} / eq {d_eq:.1f} / max {d_max:.1f} mm"
        )
