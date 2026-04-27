"""Calcium scoring panel — runs the Agatston scorer and displays results."""

from __future__ import annotations

from typing import Optional

from PyQt5 import QtCore, QtWidgets

from ..core.calcium_scoring import AgatstonScorer
from ..core.volume import Volume


class CalciumPanel(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._volume: Optional[Volume] = None

        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)

        title = QtWidgets.QLabel("Calcium scoring (Agatston)")
        title.setStyleSheet("color: #cfe1ff; font-weight: bold;")
        layout.addWidget(title)

        controls = QtWidgets.QFormLayout()
        self.threshold = QtWidgets.QSpinBox()
        self.threshold.setRange(70, 300)
        self.threshold.setValue(130)
        self.threshold.setSuffix(" HU")
        controls.addRow("Threshold", self.threshold)

        self.min_area = QtWidgets.QDoubleSpinBox()
        self.min_area.setRange(0.1, 10.0)
        self.min_area.setSingleStep(0.1)
        self.min_area.setValue(1.0)
        self.min_area.setSuffix(" mm²")
        controls.addRow("Min. lesion area", self.min_area)

        self.calibration = QtWidgets.QDoubleSpinBox()
        self.calibration.setRange(0.1, 1.5)
        self.calibration.setSingleStep(0.01)
        self.calibration.setValue(0.78)
        controls.addRow("Mass calibration", self.calibration)
        layout.addLayout(controls)

        self.run_btn = QtWidgets.QPushButton("Score")
        self.run_btn.clicked.connect(self.score)
        layout.addWidget(self.run_btn)

        self.result_table = QtWidgets.QTableWidget()
        self.result_table.setColumnCount(2)
        self.result_table.setHorizontalHeaderLabels(["Metric", "Value"])
        self.result_table.horizontalHeader().setStretchLastSection(True)
        layout.addWidget(self.result_table)

    def set_volume(self, volume: Volume) -> None:
        self._volume = volume
        self.result_table.setRowCount(0)

    def score(self) -> None:
        if self._volume is None:
            return
        scorer = AgatstonScorer(
            threshold_hu=float(self.threshold.value()),
            min_area_mm2=float(self.min_area.value()),
            calibration=float(self.calibration.value()),
        )
        report = scorer.score(self._volume)
        rows = [
            ("Total Agatston", f"{report.total_agatston():.1f}"),
            ("Risk category", report.risk_category()),
            ("Total volume", f"{report.total_volume_mm3():.1f} mm³"),
            ("Total mass", f"{report.total_mass_mg():.1f} mg"),
            ("Lesion count", str(len(report.lesions))),
        ]
        self.result_table.setRowCount(len(rows))
        for i, (k, v) in enumerate(rows):
            self.result_table.setItem(i, 0, QtWidgets.QTableWidgetItem(k))
            self.result_table.setItem(i, 1, QtWidgets.QTableWidgetItem(v))
