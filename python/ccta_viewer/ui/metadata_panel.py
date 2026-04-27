"""DICOM metadata viewer."""

from __future__ import annotations

from typing import Dict

from PyQt5 import QtCore, QtWidgets


class MetadataPanel(QtWidgets.QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(6, 6, 6, 6)
        layout.addWidget(self._title("Patient / Study"))
        self.tree = QtWidgets.QTreeWidget()
        self.tree.setColumnCount(2)
        self.tree.setHeaderLabels(["Tag", "Value"])
        self.tree.setAlternatingRowColors(True)
        layout.addWidget(self.tree)

    def _title(self, text: str) -> QtWidgets.QLabel:
        lab = QtWidgets.QLabel(text)
        lab.setStyleSheet("color: #cfe1ff; font-weight: bold;")
        return lab

    def set_metadata(self, meta: Dict[str, str]) -> None:
        self.tree.clear()
        for k, v in meta.items():
            QtWidgets.QTreeWidgetItem(self.tree, [k, str(v)])
        self.tree.resizeColumnToContents(0)
