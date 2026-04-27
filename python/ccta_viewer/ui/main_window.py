"""Main viewer window.

Layout
------
+------------+----------------------------------------+
| Series     |   Axial   |   Coronal                  |
| Metadata   +----------------------------------------+
| WL preset  |   Sagittal|   3D                       |
| Calcium    +----------------------------------------+
| Tools      |   CPR (full width, optional bottom)   |
+------------+----------------------------------------+
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional

import numpy as np
from PyQt5 import QtCore, QtGui, QtWidgets

from ..core.centerline import Centerline, smooth_path, track_centerline
from ..core.dicom_loader import DicomLoader, SeriesInfo
from ..core.mpr import MPRSlicer
from ..core.volume import Volume
from ..core.windowing import CT_PRESETS, WindowLevel
from ..utils.export import export_mp4, export_png
from .calcium_panel import CalciumPanel
from .cpr_view import CPRView
from .metadata_panel import MetadataPanel
from .mpr_view import MPRView
from .series_panel import SeriesPanel
from .volume_view import VolumeView
from .window_level_widget import WindowLevelWidget

log = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Worker threads — kept inline; the project is small enough that
# having them in their own file would just add boilerplate.
# ----------------------------------------------------------------------
class _ScanWorker(QtCore.QThread):
    finished_with = QtCore.pyqtSignal(list)
    failed = QtCore.pyqtSignal(str)

    def __init__(self, root: str):
        super().__init__()
        self.root = root

    def run(self) -> None:
        try:
            self.finished_with.emit(DicomLoader(self.root).scan())
        except Exception as exc:  # pragma: no cover - error path
            log.exception("Scan failed")
            self.failed.emit(str(exc))


class _LoadWorker(QtCore.QThread):
    finished_with = QtCore.pyqtSignal(object)
    failed = QtCore.pyqtSignal(str)

    def __init__(self, series: SeriesInfo):
        super().__init__()
        self.series = series

    def run(self) -> None:
        try:
            from ..core.dicom_loader import _build_volume
            self.finished_with.emit(_build_volume(self.series.files))
        except Exception as exc:  # pragma: no cover - error path
            log.exception("Load failed")
            self.failed.emit(str(exc))


# ----------------------------------------------------------------------
class MainWindow(QtWidgets.QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Coronary CTA Viewer")
        self.resize(1500, 950)
        self._volume: Optional[Volume] = None
        self._centerline_anchors: list = []
        self._centerline: Optional[Centerline] = None
        self._cine_timer: Optional[QtCore.QTimer] = None
        self._cine_phase = 0

        self._setup_dark_palette()
        self._build_central_widget()
        self._build_dock_panels()
        self._build_menu_bar()
        self._build_status_bar()
        self._connect_signals()

    # ------------------------------------------------------------------
    # Look & feel
    # ------------------------------------------------------------------
    def _setup_dark_palette(self) -> None:
        pal = QtGui.QPalette()
        pal.setColor(QtGui.QPalette.Window, QtGui.QColor("#0c1320"))
        pal.setColor(QtGui.QPalette.WindowText, QtGui.QColor("#cfe1ff"))
        pal.setColor(QtGui.QPalette.Base, QtGui.QColor("#0a0f1a"))
        pal.setColor(QtGui.QPalette.AlternateBase, QtGui.QColor("#101a2a"))
        pal.setColor(QtGui.QPalette.Text, QtGui.QColor("#cfe1ff"))
        pal.setColor(QtGui.QPalette.Button, QtGui.QColor("#142033"))
        pal.setColor(QtGui.QPalette.ButtonText, QtGui.QColor("#cfe1ff"))
        pal.setColor(QtGui.QPalette.Highlight, QtGui.QColor("#2c6fbb"))
        pal.setColor(QtGui.QPalette.HighlightedText, QtGui.QColor("#ffffff"))
        self.setPalette(pal)

    # ------------------------------------------------------------------
    # Central widget — three MPRs + 3D + CPR
    # ------------------------------------------------------------------
    def _build_central_widget(self) -> None:
        self.axial = MPRView("axial")
        self.coronal = MPRView("coronal")
        self.sagittal = MPRView("sagittal")
        self.volume3d = VolumeView()
        self.cpr_view = CPRView()

        top_row = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        top_row.addWidget(self.axial)
        top_row.addWidget(self.coronal)

        mid_row = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        mid_row.addWidget(self.sagittal)
        mid_row.addWidget(self.volume3d)

        upper = QtWidgets.QSplitter(QtCore.Qt.Vertical)
        upper.addWidget(top_row)
        upper.addWidget(mid_row)

        main_split = QtWidgets.QSplitter(QtCore.Qt.Vertical)
        main_split.addWidget(upper)
        main_split.addWidget(self.cpr_view)
        main_split.setStretchFactor(0, 4)
        main_split.setStretchFactor(1, 1)

        self.setCentralWidget(main_split)

    # ------------------------------------------------------------------
    # Dock panels
    # ------------------------------------------------------------------
    def _build_dock_panels(self) -> None:
        self.series_panel = SeriesPanel()
        self.metadata_panel = MetadataPanel()
        self.window_level = WindowLevelWidget()
        self.calcium_panel = CalciumPanel()

        # Slab thickness controls
        slab_widget = QtWidgets.QWidget()
        slab_layout = QtWidgets.QFormLayout(slab_widget)
        slab_layout.setContentsMargins(6, 4, 6, 4)
        self.slab_thickness = QtWidgets.QDoubleSpinBox()
        self.slab_thickness.setRange(0.0, 100.0)
        self.slab_thickness.setSingleStep(1.0)
        self.slab_thickness.setSuffix(" mm")
        self.slab_thickness.setValue(0.0)
        self.slab_thickness.valueChanged.connect(self._update_slab)
        slab_layout.addRow("Slab", self.slab_thickness)
        self.slab_mode = QtWidgets.QComboBox()
        self.slab_mode.addItems(["max", "min", "mean"])
        self.slab_mode.currentTextChanged.connect(self._update_slab)
        slab_layout.addRow("Mode", self.slab_mode)

        # Cine controls
        cine_widget = QtWidgets.QWidget()
        cine_layout = QtWidgets.QHBoxLayout(cine_widget)
        cine_layout.setContentsMargins(6, 4, 6, 4)
        self.cine_btn = QtWidgets.QPushButton("▶ Cine")
        self.cine_btn.setCheckable(True)
        self.cine_btn.toggled.connect(self._toggle_cine)
        cine_layout.addWidget(self.cine_btn)
        self.cine_speed = QtWidgets.QSpinBox()
        self.cine_speed.setRange(1, 60)
        self.cine_speed.setValue(15)
        self.cine_speed.setSuffix(" fps")
        cine_layout.addWidget(self.cine_speed)

        # Tools — measurement / centerline
        tools_widget = QtWidgets.QWidget()
        tools_layout = QtWidgets.QGridLayout(tools_widget)
        tools_layout.setContentsMargins(6, 4, 6, 4)
        self.tool_navigate = QtWidgets.QRadioButton("Navigate")
        self.tool_navigate.setChecked(True)
        self.tool_distance = QtWidgets.QRadioButton("Distance")
        self.tool_angle = QtWidgets.QRadioButton("Angle")
        self.tool_pick = QtWidgets.QRadioButton("Centerline anchor")
        for w in (self.tool_navigate, self.tool_distance, self.tool_angle, self.tool_pick):
            w.toggled.connect(self._update_tool)
        tools_layout.addWidget(self.tool_navigate, 0, 0)
        tools_layout.addWidget(self.tool_distance, 0, 1)
        tools_layout.addWidget(self.tool_angle, 1, 0)
        tools_layout.addWidget(self.tool_pick, 1, 1)
        self.build_centerline_btn = QtWidgets.QPushButton("Build centerline")
        self.build_centerline_btn.clicked.connect(self._build_centerline)
        tools_layout.addWidget(self.build_centerline_btn, 2, 0, 1, 2)
        self.track_centerline_btn = QtWidgets.QPushButton("Track between first/last")
        self.track_centerline_btn.clicked.connect(self._track_centerline)
        tools_layout.addWidget(self.track_centerline_btn, 3, 0, 1, 2)
        self.clear_anchors_btn = QtWidgets.QPushButton("Clear anchors")
        self.clear_anchors_btn.clicked.connect(self._clear_anchors)
        tools_layout.addWidget(self.clear_anchors_btn, 4, 0, 1, 2)

        left = QtWidgets.QTabWidget()
        left.addTab(self.series_panel, "Series")
        left.addTab(self.metadata_panel, "Info")
        left.addTab(self.calcium_panel, "Calcium")

        right_top = QtWidgets.QWidget()
        right_top_layout = QtWidgets.QVBoxLayout(right_top)
        right_top_layout.setContentsMargins(2, 2, 2, 2)
        right_top_layout.addWidget(self._titled("Window / Level", self.window_level))
        right_top_layout.addWidget(self._titled("Slab projection", slab_widget))
        right_top_layout.addWidget(self._titled("Cine (cardiac phases)", cine_widget))
        right_top_layout.addWidget(self._titled("Tools", tools_widget))
        right_top_layout.addStretch(1)

        left_dock = QtWidgets.QDockWidget("Browser", self)
        left_dock.setWidget(left)
        left_dock.setAllowedAreas(QtCore.Qt.LeftDockWidgetArea)
        self.addDockWidget(QtCore.Qt.LeftDockWidgetArea, left_dock)

        right_dock = QtWidgets.QDockWidget("Controls", self)
        right_dock.setWidget(right_top)
        right_dock.setAllowedAreas(QtCore.Qt.RightDockWidgetArea)
        self.addDockWidget(QtCore.Qt.RightDockWidgetArea, right_dock)

    def _titled(self, title: str, widget: QtWidgets.QWidget) -> QtWidgets.QGroupBox:
        box = QtWidgets.QGroupBox(title)
        box.setStyleSheet(
            "QGroupBox { color: #cfe1ff; border: 1px solid #1f2c44; margin-top: 8px; "
            "padding-top: 10px; } QGroupBox::title { subcontrol-origin: margin; left: 8px; }"
        )
        layout = QtWidgets.QVBoxLayout(box)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.addWidget(widget)
        return box

    # ------------------------------------------------------------------
    def _build_menu_bar(self) -> None:
        menu = self.menuBar()
        file_menu = menu.addMenu("&File")

        open_dir = QtGui.QAction("Open DICOM &folder…", self)
        open_dir.setShortcut(QtGui.QKeySequence.Open)
        open_dir.triggered.connect(self._open_folder)
        file_menu.addAction(open_dir)

        export_png_act = QtGui.QAction("Export current &slice (PNG)…", self)
        export_png_act.triggered.connect(self._export_current_png)
        file_menu.addAction(export_png_act)

        export_cine_act = QtGui.QAction("Export &cine (MP4)…", self)
        export_cine_act.triggered.connect(self._export_cine)
        file_menu.addAction(export_cine_act)

        file_menu.addSeparator()
        quit_act = QtGui.QAction("&Quit", self)
        quit_act.setShortcut(QtGui.QKeySequence.Quit)
        quit_act.triggered.connect(self.close)
        file_menu.addAction(quit_act)

        view_menu = menu.addMenu("&View")
        for name in CT_PRESETS:
            act = QtGui.QAction(name, self)
            act.triggered.connect(lambda _=False, n=name: self._apply_wl_preset(n))
            view_menu.addAction(act)

        help_menu = menu.addMenu("&Help")
        about = QtGui.QAction("About", self)
        about.triggered.connect(self._show_about)
        help_menu.addAction(about)

    def _build_status_bar(self) -> None:
        self.statusBar().showMessage("Open a DICOM folder to begin.")

    # ------------------------------------------------------------------
    # Signal wiring
    # ------------------------------------------------------------------
    def _connect_signals(self) -> None:
        self.series_panel.seriesSelected.connect(self._load_series)
        self.window_level.windowLevelChanged.connect(self._apply_wl)
        for view in (self.axial, self.coronal, self.sagittal):
            view.crosshairMoved.connect(self._sync_crosshair)
            view.pointPicked.connect(self._on_point_picked)

    # ------------------------------------------------------------------
    # File / load
    # ------------------------------------------------------------------
    def _open_folder(self) -> None:
        folder = QtWidgets.QFileDialog.getExistingDirectory(self, "Open DICOM folder")
        if not folder:
            return
        self.statusBar().showMessage(f"Scanning {folder}…")
        self._scan_worker = _ScanWorker(folder)
        self._scan_worker.finished_with.connect(self._on_scan_done)
        self._scan_worker.failed.connect(lambda msg: self._error("Scan failed", msg))
        self._scan_worker.start()

    def _on_scan_done(self, series: List[SeriesInfo]) -> None:
        self.series_panel.set_series(series)
        self.statusBar().showMessage(f"Found {len(series)} series. Double-click to load.")

    def _load_series(self, series: SeriesInfo) -> None:
        self.statusBar().showMessage(f"Loading {series.description} ({series.n_images} images)…")
        self._load_worker = _LoadWorker(series)
        self._load_worker.finished_with.connect(self._on_load_done)
        self._load_worker.failed.connect(lambda msg: self._error("Load failed", msg))
        self._load_worker.start()

    def _on_load_done(self, volume: Volume) -> None:
        self._volume = volume
        slicer = MPRSlicer(volume)
        for v in (self.axial, self.coronal, self.sagittal):
            v.set_slicer(slicer)
            v.set_window_level(self.window_level.value())
        self.volume3d.set_volume(volume)
        self.cpr_view.set_volume(volume)
        self.cpr_view.set_window_level(self.window_level.value())
        self.metadata_panel.set_metadata(volume.metadata)
        self.calcium_panel.set_volume(volume)
        nz, ny, nx = volume.shape
        self.statusBar().showMessage(
            f"Loaded {volume.modality} volume {nx}×{ny}×{nz}, "
            f"spacing {volume.spacing[2]:.2f}×{volume.spacing[1]:.2f}×{volume.spacing[0]:.2f} mm "
            f"({volume.n_phases} phases)" if volume.is_4d else
            f"Loaded {volume.modality} volume {nx}×{ny}×{nz}, "
            f"spacing {volume.spacing[2]:.2f}×{volume.spacing[1]:.2f}×{volume.spacing[0]:.2f} mm"
        )

    # ------------------------------------------------------------------
    # WL & slab
    # ------------------------------------------------------------------
    def _apply_wl(self, wl: WindowLevel) -> None:
        for v in (self.axial, self.coronal, self.sagittal):
            v.set_window_level(wl)
        self.cpr_view.set_window_level(wl)

    def _apply_wl_preset(self, name: str) -> None:
        self.window_level.preset.setCurrentText(name)

    def _update_slab(self) -> None:
        thickness = float(self.slab_thickness.value())
        mode = self.slab_mode.currentText()
        for v in (self.axial, self.coronal, self.sagittal):
            v.set_slab_thickness(thickness, mode)

    # ------------------------------------------------------------------
    # Crosshair sync
    # ------------------------------------------------------------------
    def _sync_crosshair(self, plane: str, row: int, col: int) -> None:
        # The (row, col) in one plane fixes one or two indices in the others.
        if not self._volume:
            return
        if plane == "axial":  # row=y, col=x
            self.coronal.set_index(row)
            self.sagittal.set_index(col)
            self.coronal.set_crosshair(self.axial.current_index, col)
            self.sagittal.set_crosshair(self.axial.current_index, row)
            self.axial.set_crosshair(row, col)
        elif plane == "coronal":  # row=z, col=x
            self.axial.set_index(row)
            self.sagittal.set_index(col)
            self.axial.set_crosshair(self.coronal.current_index, col)
            self.sagittal.set_crosshair(row, self.coronal.current_index)
            self.coronal.set_crosshair(row, col)
        elif plane == "sagittal":  # row=z, col=y
            self.axial.set_index(row)
            self.coronal.set_index(col)
            self.axial.set_crosshair(col, self.sagittal.current_index)
            self.coronal.set_crosshair(row, self.sagittal.current_index)
            self.sagittal.set_crosshair(row, col)

    # ------------------------------------------------------------------
    # Tools / centerline
    # ------------------------------------------------------------------
    def _update_tool(self) -> None:
        tool = "navigate"
        if self.tool_distance.isChecked():
            tool = "distance"
        elif self.tool_angle.isChecked():
            tool = "angle"
        elif self.tool_pick.isChecked():
            tool = "pick"
        for v in (self.axial, self.coronal, self.sagittal):
            v.set_tool(tool)

    def _on_point_picked(self, plane: str, z: int, y: int, x: int) -> None:
        self._centerline_anchors.append((z, y, x))
        self.statusBar().showMessage(
            f"Anchor #{len(self._centerline_anchors)}: ({z}, {y}, {x})"
        )

    def _build_centerline(self) -> None:
        if len(self._centerline_anchors) < 2:
            self._error("Centerline", "Pick at least two anchor points first.")
            return
        cl = smooth_path(self._centerline_anchors, samples=400)
        self._centerline = cl
        self.cpr_view.set_centerline(cl)
        self.statusBar().showMessage(
            f"Centerline built from {len(self._centerline_anchors)} anchors"
        )

    def _track_centerline(self) -> None:
        if self._volume is None or len(self._centerline_anchors) < 2:
            self._error("Centerline", "Need a volume and at least two anchors.")
            return
        start = self._centerline_anchors[0]
        end = self._centerline_anchors[-1]
        self.statusBar().showMessage("Tracking centerline (Dijkstra)…")
        QtWidgets.QApplication.processEvents()
        cl = track_centerline(self._volume, start, end)
        self._centerline = cl
        self.cpr_view.set_centerline(cl)
        self.statusBar().showMessage(
            f"Tracked centerline with {cl.n_points} points "
            f"({cl.length_mm(self._volume.spacing):.1f} mm)"
        )

    def _clear_anchors(self) -> None:
        self._centerline_anchors.clear()
        self._centerline = None
        self.cpr_view.set_centerline(None)
        for v in (self.axial, self.coronal, self.sagittal):
            v.clear_measurements()
        self.statusBar().showMessage("Cleared anchors and measurements.")

    # ------------------------------------------------------------------
    # Cine (cardiac phases)
    # ------------------------------------------------------------------
    def _toggle_cine(self, on: bool) -> None:
        if on and self._volume and self._volume.is_4d:
            self._cine_timer = QtCore.QTimer(self)
            self._cine_timer.timeout.connect(self._advance_phase)
            self._cine_timer.start(int(1000 / max(1, self.cine_speed.value())))
            self.cine_btn.setText("⏸ Cine")
        else:
            if self._cine_timer:
                self._cine_timer.stop()
                self._cine_timer = None
            self.cine_btn.setText("▶ Cine")
            if on and (not self._volume or not self._volume.is_4d):
                self.cine_btn.setChecked(False)
                self.statusBar().showMessage("No 4D phases in current series.")

    def _advance_phase(self) -> None:
        if not self._volume or not self._volume.is_4d:
            return
        self._cine_phase = (self._cine_phase + 1) % self._volume.n_phases
        self._volume.array = self._volume.phases[self._cine_phase]
        for v in (self.axial, self.coronal, self.sagittal):
            v.refresh()
        self.statusBar().showMessage(
            f"Phase {self._cine_phase + 1}/{self._volume.n_phases}"
        )

    # ------------------------------------------------------------------
    # Export
    # ------------------------------------------------------------------
    def _export_current_png(self) -> None:
        if not self._volume:
            return
        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Export PNG", "axial.png", "PNG (*.png)"
        )
        if not path:
            return
        sl = self.axial.slicer.slice("axial", self.axial.current_index)
        from ..core.windowing import apply_window
        img = apply_window(sl.image, self.window_level.value())
        export_png(img, path)
        self.statusBar().showMessage(f"Saved {path}")

    def _export_cine(self) -> None:
        if not self._volume:
            return
        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "Export cine MP4", "cine.mp4", "MP4 (*.mp4)"
        )
        if not path:
            return
        from ..core.windowing import apply_window
        wl = self.window_level.value()
        if self._volume.is_4d:
            frames = []
            for p in range(self._volume.n_phases):
                arr = self._volume.phases[p, self.axial.current_index]
                frames.append(apply_window(arr, wl))
        else:
            frames = []
            for z in range(self._volume.shape[0]):
                frames.append(apply_window(self._volume.array[z], wl))
        export_mp4(frames, path, fps=self.cine_speed.value())
        self.statusBar().showMessage(f"Saved {path} ({len(frames)} frames)")

    # ------------------------------------------------------------------
    def _show_about(self) -> None:
        QtWidgets.QMessageBox.about(
            self,
            "About",
            "<h3>Coronary CTA Viewer</h3>"
            "<p>A Python DICOM viewer focused on cardiac CT angiography.</p>"
            "<p>Features: MPR, MIP/MinIP/AvgIP slabs, CPR, vessel tracking, "
            "Agatston calcium scoring, cine playback, 3D volume rendering.</p>",
        )

    def _error(self, title: str, msg: str) -> None:
        QtWidgets.QMessageBox.warning(self, title, msg)
        self.statusBar().showMessage(msg)
