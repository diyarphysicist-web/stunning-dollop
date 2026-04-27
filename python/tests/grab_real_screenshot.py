"""Launch the real PyQt5 main window offscreen and save a screenshot.

This runs the actual viewer code (the same MainWindow used in
production), loads the synthetic DICOM series we just generated, and
grabs the rendered widget surface to a PNG.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PyQt5 import QtCore, QtGui, QtWidgets

from ccta_viewer.core.dicom_loader import _build_volume, DicomLoader
from ccta_viewer.core.mpr import MPRSlicer
from ccta_viewer.ui.main_window import MainWindow


def main() -> int:
    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.resize(1500, 920)
    win.show()
    app.processEvents()

    # Scan the synthetic folder synchronously for screenshot purposes.
    folder = Path(__file__).resolve().parents[1] / "sample_data" / "synthetic"
    series_list = DicomLoader(folder).scan()
    win._on_scan_done(series_list)
    if series_list:
        # Build the volume directly (skip the worker thread).
        vol = _build_volume(series_list[0].files)
        win._on_load_done(vol)

        # Pick a few centerline anchors so the CPR pane shows real content.
        import numpy as np
        nz = vol.shape[0]
        t = np.linspace(0, 4 * np.pi, 200)
        vy = (160 + 50 * np.cos(t)).astype(int)
        vx = (160 + 50 * np.sin(t)).astype(int)
        vz = np.linspace(5, nz - 5, 200).astype(int)
        for z, y, x in list(zip(vz[::20], vy[::20], vx[::20])):
            win._on_point_picked("axial", int(z), int(y), int(x))
        win._build_centerline()

        # Move slices to where the vessel is visible.
        win.axial.set_index(40)
        win.coronal.set_index(210)
        win.sagittal.set_index(160)
        win.axial.set_crosshair(210, 160)
        win.coronal.set_crosshair(40, 160)
        win.sagittal.set_crosshair(40, 210)

        # Apply a slab MIP for a more vascular look.
        win.slab_thickness.setValue(20.0)
        win.slab_mode.setCurrentText("max")

        # Populate the CPR cross-section by simulating a hover.
        from PyQt5 import QtCore
        view = win.cpr_view
        scene = view.cpr_widget.scene()
        # Map a logical (row, col) on the CPR image to scene coords.
        cpr_h, cpr_w = view._cpr_image.shape if view._cpr_image is not None else (1, 1)
        scene_pt = view.cpr_viewbox.mapViewToScene(QtCore.QPointF(cpr_w / 2, cpr_h * 0.55))
        view._on_mouse_moved(scene_pt)

        # Run the calcium scorer
        win.calcium_panel.score()

    # Two render passes so the layout settles.
    for _ in range(8):
        app.processEvents()
        QtCore.QThread.msleep(40)

    out = Path(__file__).resolve().parents[1] / "docs" / "viewer_real.png"
    out.parent.mkdir(exist_ok=True)
    pixmap = win.grab()
    pixmap.save(str(out))
    print(f"Wrote {out}  ({out.stat().st_size // 1024} KB, {pixmap.width()}x{pixmap.height()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
