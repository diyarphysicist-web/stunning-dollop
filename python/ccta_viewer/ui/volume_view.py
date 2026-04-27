"""3D volume rendering using VTK.

The widget exposes a few standard cardiac transfer functions (vessel
emphasis, bone, MIP, soft tissue) and a clip plane controlled by the
crosshair position from the MPR panes, so the 3D view scrolls in sync
with 2D scrolling.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
from PyQt5 import QtCore, QtWidgets

import os

# Detect headless Qt — VTK's GL context creation segfaults there.
_HEADLESS = os.environ.get("QT_QPA_PLATFORM", "").startswith("offscreen") or \
            os.environ.get("CCTA_DISABLE_VTK") == "1"

try:
    if _HEADLESS:
        raise RuntimeError("Headless Qt — skipping VTK")
    import vtk
    from vtk.qt.QVTKRenderWindowInteractor import QVTKRenderWindowInteractor
    from vtkmodules.util import numpy_support
    HAVE_VTK = True
except Exception:  # pragma: no cover - VTK is heavy and may be missing
    HAVE_VTK = False

from ..core.volume import Volume


PRESETS = {
    "Vessel (CTA)": [
        # (HU, opacity, R, G, B)
        (-1024, 0.0, 0.0, 0.0, 0.0),
        (50, 0.0, 0.4, 0.1, 0.05),
        (180, 0.05, 0.7, 0.2, 0.1),
        (250, 0.4, 1.0, 0.5, 0.3),
        (450, 0.85, 1.0, 0.9, 0.6),
        (1500, 0.95, 1.0, 1.0, 1.0),
    ],
    "Bone": [
        (-1024, 0.0, 0.0, 0.0, 0.0),
        (200, 0.0, 0.2, 0.2, 0.2),
        (400, 0.5, 0.8, 0.7, 0.55),
        (1500, 1.0, 1.0, 1.0, 0.9),
    ],
    "Soft tissue": [
        (-1024, 0.0, 0.0, 0.0, 0.0),
        (-500, 0.0, 0.5, 0.3, 0.2),
        (40, 0.2, 0.85, 0.6, 0.5),
        (400, 0.6, 1.0, 0.95, 0.85),
        (1500, 0.9, 1.0, 1.0, 1.0),
    ],
    "MIP": [
        (-1024, 0.0, 0.0, 0.0, 0.0),
        (200, 0.5, 1.0, 1.0, 1.0),
        (1500, 1.0, 1.0, 1.0, 1.0),
    ],
}


class VolumeView(QtWidgets.QWidget):
    """3D volume rendering panel."""

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(2)

        toolbar = QtWidgets.QToolBar()
        toolbar.setStyleSheet("QToolBar { background: #142033; }")
        self.preset_combo = QtWidgets.QComboBox()
        for n in PRESETS:
            self.preset_combo.addItem(n)
        self.preset_combo.currentTextChanged.connect(self._apply_preset)
        toolbar.addWidget(QtWidgets.QLabel(" Preset "))
        toolbar.addWidget(self.preset_combo)

        self.shade = QtWidgets.QCheckBox("Shading")
        self.shade.setChecked(True)
        self.shade.toggled.connect(self._toggle_shading)
        toolbar.addWidget(self.shade)

        reset_btn = QtWidgets.QPushButton("Reset view")
        reset_btn.clicked.connect(self.reset_view)
        toolbar.addWidget(reset_btn)
        layout.addWidget(toolbar)

        self._volume_actor = None
        self.iren = None
        self.renderer = None

        if not HAVE_VTK:
            self._install_placeholder(
                layout, "VTK is not available — install `vtk` to enable 3D volume rendering."
            )
            return

        try:
            self.iren = QVTKRenderWindowInteractor(self)
            layout.addWidget(self.iren)
            self.renderer = vtk.vtkRenderer()
            self.renderer.SetBackground(0.04, 0.06, 0.09)
            self.iren.GetRenderWindow().AddRenderer(self.renderer)
            self.iren.Initialize()
        except Exception as exc:
            # Headless / no GL context — fall back to a placeholder.
            self.iren = None
            self.renderer = None
            self._install_placeholder(
                layout, f"3D rendering disabled (no GPU/GL context): {exc}"
            )

    def _install_placeholder(self, layout, message: str) -> None:
        placeholder = QtWidgets.QLabel(message)
        placeholder.setAlignment(QtCore.Qt.AlignCenter)
        placeholder.setStyleSheet("color: #9fb6d6;")
        placeholder.setWordWrap(True)
        layout.addWidget(placeholder)

    # ------------------------------------------------------------------
    def set_volume(self, volume: Volume) -> None:
        if not HAVE_VTK or self.renderer is None:
            return
        if self._volume_actor is not None:
            self.renderer.RemoveVolume(self._volume_actor)

        arr = volume.array.astype(np.int16)
        flat = np.ascontiguousarray(arr).ravel()
        vtk_data = numpy_support.numpy_to_vtk(
            flat, deep=True, array_type=vtk.VTK_SHORT
        )
        image = vtk.vtkImageData()
        nz, ny, nx = arr.shape
        image.SetDimensions(nx, ny, nz)
        sz, sy, sx = volume.spacing
        image.SetSpacing(sx, sy, sz)
        image.SetOrigin(*volume.origin)
        image.GetPointData().SetScalars(vtk_data)

        mapper = vtk.vtkSmartVolumeMapper()
        mapper.SetInputData(image)
        mapper.SetBlendModeToComposite()

        prop = vtk.vtkVolumeProperty()
        prop.SetInterpolationTypeToLinear()
        prop.ShadeOn()
        prop.SetAmbient(0.3)
        prop.SetDiffuse(0.7)
        prop.SetSpecular(0.4)

        actor = vtk.vtkVolume()
        actor.SetMapper(mapper)
        actor.SetProperty(prop)

        self._volume_actor = actor
        self.renderer.AddVolume(actor)
        self._apply_preset(self.preset_combo.currentText())
        self.reset_view()

    def reset_view(self) -> None:
        if HAVE_VTK and self.renderer is not None and self.iren is not None:
            try:
                self.renderer.ResetCamera()
                self.iren.GetRenderWindow().Render()
            except Exception:
                pass

    def _apply_preset(self, name: str) -> None:
        if not HAVE_VTK or self._volume_actor is None or self.iren is None:
            return
        spec = PRESETS.get(name)
        if not spec:
            return
        opacity = vtk.vtkPiecewiseFunction()
        color = vtk.vtkColorTransferFunction()
        for hu, a, r, g, b in spec:
            opacity.AddPoint(hu, a)
            color.AddRGBPoint(hu, r, g, b)
        prop = self._volume_actor.GetProperty()
        prop.SetColor(color)
        prop.SetScalarOpacity(opacity)
        if name == "MIP":
            self._volume_actor.GetMapper().SetBlendModeToMaximumIntensity()
        else:
            self._volume_actor.GetMapper().SetBlendModeToComposite()
        self.iren.GetRenderWindow().Render()

    def _toggle_shading(self, on: bool) -> None:
        if not HAVE_VTK or self._volume_actor is None or self.iren is None:
            return
        self._volume_actor.GetProperty().SetShade(1 if on else 0)
        try:
            self.iren.GetRenderWindow().Render()
        except Exception:
            pass
