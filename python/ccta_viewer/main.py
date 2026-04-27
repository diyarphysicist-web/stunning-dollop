"""Console entry point.

Usage::

    ccta-viewer                    # launch GUI, no series loaded
    ccta-viewer /path/to/dicoms    # launch GUI and pre-scan a folder
    ccta-viewer score /path/...    # headless: print Agatston report
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import List, Optional


def _gui(folder: Optional[str]) -> int:
    from PyQt5 import QtWidgets

    from .ui.main_window import MainWindow

    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
    win = MainWindow()
    win.show()
    if folder:
        win._scan_worker = win.findChild(type(win))  # placeholder to keep ref
        from .ui.main_window import _ScanWorker
        win._scan_worker = _ScanWorker(folder)
        win._scan_worker.finished_with.connect(win._on_scan_done)
        win._scan_worker.failed.connect(lambda msg: win._error("Scan failed", msg))
        win._scan_worker.start()
        win.statusBar().showMessage(f"Scanning {folder}…")
    return app.exec()


def _score(folder: str) -> int:
    from .core.calcium_scoring import AgatstonScorer
    from .core.dicom_loader import load_series

    volume = load_series(folder)
    report = AgatstonScorer().score(volume)
    print(f"Series modality:   {volume.modality}")
    print(f"Volume shape:      {volume.shape}")
    print(f"Voxel spacing:     {volume.spacing}")
    print()
    print(f"Total Agatston:    {report.total_agatston():.1f}")
    print(f"Risk category:     {report.risk_category()}")
    print(f"Total volume:      {report.total_volume_mm3():.1f} mm^3")
    print(f"Total mass:        {report.total_mass_mg():.1f} mg")
    print(f"Number of lesions: {len(report.lesions)}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Coronary CT Angiography viewer")
    parser.add_argument("--verbose", "-v", action="store_true")
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("gui", help="Launch the GUI (default)")
    score_p = sub.add_parser("score", help="Headless Agatston calcium score")
    score_p.add_argument("folder")
    parser.add_argument("folder", nargs="?", help="Optional DICOM folder for the GUI")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO)

    if args.cmd == "score":
        return _score(args.folder)
    return _gui(args.folder)


if __name__ == "__main__":
    raise SystemExit(main())
