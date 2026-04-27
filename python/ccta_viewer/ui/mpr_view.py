"""A single MPR pane built on pyqtgraph for fast pan/zoom/scroll.

Responsibilities:
  * display the current 2D slice with the active window/level
  * synchronise crosshair position with sibling panes
  * forward wheel scroll to slice index changes
  * accept measurement and centerline-anchor mouse interactions
"""

from __future__ import annotations

from typing import Callable, List, Optional, Tuple

import numpy as np
import pyqtgraph as pg
from PyQt5 import QtCore, QtGui, QtWidgets

from ..core.mpr import MPRSlicer, Plane
from ..core.windowing import WindowLevel, apply_window
from ..core.measurements import DistanceMeasurement, AngleMeasurement


class MPRView(QtWidgets.QWidget):
    """A single orthogonal MPR plane."""

    sliceChanged = QtCore.pyqtSignal(str, int)
    crosshairMoved = QtCore.pyqtSignal(str, int, int)  # plane, row, col
    pointPicked = QtCore.pyqtSignal(str, int, int, int)  # plane, z, y, x

    def __init__(self, plane: str, parent: Optional[QtWidgets.QWidget] = None):
        super().__init__(parent)
        self.plane = plane
        self.slicer: Optional[MPRSlicer] = None
        self.window_level = WindowLevel(700, 200, "Coronary")
        self.slab_thickness = 0.0
        self.projection_mode = "max"
        self.current_index = 0
        self.show_crosshair = True
        self._distance_anchors: List[Tuple[int, int]] = []
        self._angle_anchors: List[Tuple[int, int]] = []
        self._measurements: List[object] = []
        self._tool: str = "navigate"  # navigate | distance | angle | pick
        self._build_ui()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        header = QtWidgets.QLabel(self.plane.capitalize())
        header.setStyleSheet(
            "color: #b8d6ff; padding: 2px 6px; font-weight: bold; background: #142033;"
        )
        layout.addWidget(header)

        self.glw = pg.GraphicsLayoutWidget()
        self.glw.setBackground("#0a0e15")
        self.viewbox = self.glw.addViewBox(lockAspect=True, invertY=True)
        self.image_item = pg.ImageItem(axisOrder="row-major")
        self.viewbox.addItem(self.image_item)
        self.viewbox.setMenuEnabled(False)

        self.h_line = pg.InfiniteLine(angle=0, pen=pg.mkPen("#33ff88", width=1))
        self.v_line = pg.InfiniteLine(angle=90, pen=pg.mkPen("#33ff88", width=1))
        self.viewbox.addItem(self.h_line, ignoreBounds=True)
        self.viewbox.addItem(self.v_line, ignoreBounds=True)

        self.overlay_text = pg.TextItem("", color="#bcd9ff", anchor=(0, 0))
        self.overlay_text.setPos(5, 5)
        self.overlay_text.setParentItem(self.viewbox)

        self.measurement_overlay = pg.GraphItem()
        self.viewbox.addItem(self.measurement_overlay)

        layout.addWidget(self.glw)

        # Slice slider beneath the image.
        slider_row = QtWidgets.QHBoxLayout()
        self.slider = QtWidgets.QSlider(QtCore.Qt.Horizontal)
        self.slider.valueChanged.connect(self._on_slider_change)
        self.slider.setEnabled(False)
        self.slice_label = QtWidgets.QLabel("0 / 0")
        self.slice_label.setStyleSheet("color: #bcd9ff; min-width: 70px;")
        slider_row.addWidget(self.slider)
        slider_row.addWidget(self.slice_label)
        layout.addLayout(slider_row)

        # Mouse interactions
        self.viewbox.scene().sigMouseClicked.connect(self._on_mouse_click)
        self.viewbox.scene().sigMouseMoved.connect(self._on_mouse_moved)
        self.glw.installEventFilter(self)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def set_slicer(self, slicer: MPRSlicer) -> None:
        self.slicer = slicer
        size = self._axis_size()
        self.slider.blockSignals(True)
        self.slider.setRange(0, max(0, size - 1))
        self.slider.setValue(size // 2)
        self.slider.setEnabled(size > 0)
        self.slider.blockSignals(False)
        self.current_index = size // 2
        self.refresh()

    def set_window_level(self, wl: WindowLevel) -> None:
        self.window_level = wl
        self.refresh()

    def set_slab_thickness(self, thickness_mm: float, mode: str = "max") -> None:
        self.slab_thickness = max(0.0, thickness_mm)
        self.projection_mode = mode
        self.refresh()

    def set_index(self, index: int) -> None:
        if not self.slicer:
            return
        index = int(np.clip(index, 0, self._axis_size() - 1))
        if index == self.current_index:
            return
        self.current_index = index
        self.slider.blockSignals(True)
        self.slider.setValue(index)
        self.slider.blockSignals(False)
        self.refresh()
        self.sliceChanged.emit(self.plane, index)

    def set_crosshair(self, row: int, col: int) -> None:
        self.h_line.setPos(row + 0.5)
        self.v_line.setPos(col + 0.5)

    def set_tool(self, tool: str) -> None:
        self._tool = tool
        self._distance_anchors.clear()
        self._angle_anchors.clear()

    def clear_measurements(self) -> None:
        self._measurements.clear()
        self._redraw_measurements()

    # ------------------------------------------------------------------
    # Rendering
    # ------------------------------------------------------------------
    def refresh(self) -> None:
        if not self.slicer:
            return
        if self.slab_thickness > 0:
            sl = self.slicer.thick_slab(
                self.plane, self.current_index, self.slab_thickness, self.projection_mode
            )
        else:
            sl = self.slicer.slice(self.plane, self.current_index)
        img = apply_window(sl.image, self.window_level)
        self.image_item.setImage(img, autoLevels=False)
        self.viewbox.setAspectLocked(True, ratio=sl.aspect)

        size = self._axis_size()
        self.slice_label.setText(f"{self.current_index + 1} / {size}")
        self.overlay_text.setText(
            f"{self.plane.capitalize()}  "
            f"WL {self.window_level.center:.0f} / WW {self.window_level.width:.0f}"
        )
        self._redraw_measurements()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _axis_size(self) -> int:
        if not self.slicer:
            return 0
        nz, ny, nx = self.slicer.volume.shape
        if self.plane == Plane.AXIAL.value:
            return nz
        if self.plane == Plane.CORONAL.value:
            return ny
        if self.plane == Plane.SAGITTAL.value:
            return nx
        return 0

    def _on_slider_change(self, value: int) -> None:
        self.set_index(value)

    def _on_mouse_moved(self, pos) -> None:
        if not self.slicer:
            return
        if not self.viewbox.sceneBoundingRect().contains(pos):
            return
        p = self.viewbox.mapSceneToView(pos)
        row, col = int(p.y()), int(p.x())
        if self.show_crosshair:
            self.crosshairMoved.emit(self.plane, row, col)

    def _on_mouse_click(self, evt) -> None:
        if not self.slicer:
            return
        if evt.button() != QtCore.Qt.LeftButton:
            return
        if not self.viewbox.sceneBoundingRect().contains(evt.scenePos()):
            return
        p = self.viewbox.mapSceneToView(evt.scenePos())
        row, col = int(p.y()), int(p.x())
        if self._tool == "distance":
            self._distance_anchors.append((row, col))
            if len(self._distance_anchors) == 2:
                z, y, x = self._to_volume_coords(*self._distance_anchors[0])
                z2, y2, x2 = self._to_volume_coords(*self._distance_anchors[1])
                self._measurements.append(DistanceMeasurement((z, y, x), (z2, y2, x2)))
                self._distance_anchors.clear()
                self._redraw_measurements()
        elif self._tool == "angle":
            self._angle_anchors.append((row, col))
            if len(self._angle_anchors) == 3:
                pts = [self._to_volume_coords(*a) for a in self._angle_anchors]
                self._measurements.append(AngleMeasurement(pts[0], pts[1], pts[2]))
                self._angle_anchors.clear()
                self._redraw_measurements()
        elif self._tool == "pick":
            z, y, x = self._to_volume_coords(row, col)
            self.pointPicked.emit(self.plane, z, y, x)

    def _to_volume_coords(self, row: int, col: int) -> Tuple[int, int, int]:
        idx = self.current_index
        if self.plane == Plane.AXIAL.value:
            return idx, row, col
        if self.plane == Plane.CORONAL.value:
            return row, idx, col
        if self.plane == Plane.SAGITTAL.value:
            return row, col, idx
        return idx, row, col

    def _redraw_measurements(self) -> None:
        if not self.slicer:
            return
        spacing = self.slicer.volume.spacing
        # Pull text labels from measurements that intersect this slice.
        items = []
        for m in self._measurements:
            if isinstance(m, DistanceMeasurement):
                items.append(f"D = {m.length_mm(spacing):.1f} mm")
            elif isinstance(m, AngleMeasurement):
                items.append(f"∠ = {m.angle_deg(spacing):.1f}°")
        self.overlay_text.setText(
            f"{self.plane.capitalize()}  "
            f"WL {self.window_level.center:.0f} / WW {self.window_level.width:.0f}"
            + ("\n" + "\n".join(items) if items else "")
        )

    # ------------------------------------------------------------------
    # Event filter — wheel = slice scroll, RMB drag = window/level
    # ------------------------------------------------------------------
    def eventFilter(self, obj, event):
        if event.type() == QtCore.QEvent.Wheel and self.slicer:
            delta = 1 if event.angleDelta().y() > 0 else -1
            self.set_index(self.current_index + delta)
            return True
        return super().eventFilter(obj, event)
