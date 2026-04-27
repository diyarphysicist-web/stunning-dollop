"""Window/Level controls — preset combo + width/center spin boxes."""

from __future__ import annotations

from PyQt5 import QtCore, QtWidgets

from ..core.windowing import CT_PRESETS, WindowLevel


class WindowLevelWidget(QtWidgets.QWidget):
    windowLevelChanged = QtCore.pyqtSignal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QtWidgets.QFormLayout(self)
        layout.setContentsMargins(6, 4, 6, 4)
        layout.setSpacing(4)

        self.preset = QtWidgets.QComboBox()
        for name in CT_PRESETS:
            self.preset.addItem(name)
        self.preset.setCurrentText("Coronary")
        self.preset.currentTextChanged.connect(self._on_preset)
        layout.addRow("Preset", self.preset)

        self.width = QtWidgets.QSpinBox()
        self.width.setRange(1, 8000)
        self.width.setValue(700)
        self.width.valueChanged.connect(self._emit)
        layout.addRow("Window", self.width)

        self.center = QtWidgets.QSpinBox()
        self.center.setRange(-2000, 4000)
        self.center.setValue(200)
        self.center.valueChanged.connect(self._emit)
        layout.addRow("Level", self.center)

    def _on_preset(self, name: str) -> None:
        wl = CT_PRESETS.get(name)
        if not wl:
            return
        self.width.blockSignals(True)
        self.center.blockSignals(True)
        self.width.setValue(int(wl.width))
        self.center.setValue(int(wl.center))
        self.width.blockSignals(False)
        self.center.blockSignals(False)
        self._emit()

    def _emit(self) -> None:
        self.windowLevelChanged.emit(
            WindowLevel(float(self.width.value()), float(self.center.value()))
        )

    def value(self) -> WindowLevel:
        return WindowLevel(float(self.width.value()), float(self.center.value()))
