"""Series browser — lists DICOM series found under a folder.

Double-clicking a series emits :data:`seriesSelected` with the
:class:`SeriesInfo`; the main window uses that to load the full
volume on a worker thread.
"""

from __future__ import annotations

from typing import List

from PyQt5 import QtCore, QtWidgets

from ..core.dicom_loader import SeriesInfo


class SeriesPanel(QtWidgets.QWidget):
    seriesSelected = QtCore.pyqtSignal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._series: List[SeriesInfo] = []

        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)

        title = QtWidgets.QLabel("Series")
        title.setStyleSheet("color: #cfe1ff; font-weight: bold;")
        layout.addWidget(title)

        self.tree = QtWidgets.QTreeWidget()
        self.tree.setColumnCount(4)
        self.tree.setHeaderLabels(["Description", "Modality", "Images", "Study date"])
        self.tree.setAlternatingRowColors(True)
        self.tree.itemDoubleClicked.connect(self._on_double_click)
        layout.addWidget(self.tree)

    def set_series(self, series: List[SeriesInfo]) -> None:
        self._series = series
        self.tree.clear()
        for s in series:
            item = QtWidgets.QTreeWidgetItem(
                [s.description or "(no description)", s.modality, str(s.n_images), s.study_date]
            )
            item.setData(0, QtCore.Qt.UserRole, s)
            self.tree.addTopLevelItem(item)
        self.tree.resizeColumnToContents(0)

    def _on_double_click(self, item: QtWidgets.QTreeWidgetItem) -> None:
        s = item.data(0, QtCore.Qt.UserRole)
        if s is not None:
            self.seriesSelected.emit(s)
