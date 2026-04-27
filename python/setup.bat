@echo off
REM Coronary CTA Viewer - Windows setup script.
REM Picks the best available Python, installs dependencies and builds
REM the synthetic DICOM phantom so the viewer has data to show.

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo === Coronary CTA Viewer setup ===
echo.

REM --- 1. Find a usable Python (prefer 3.12, then 3.11, then 3.13, then default) ---
set "PYCMD="
for %%V in (3.12 3.11 3.13 3.10) do (
    if not defined PYCMD (
        py -%%V -c "import sys; print(sys.version)" >nul 2>&1
        if !errorlevel! == 0 (
            set "PYCMD=py -%%V"
            echo Using Python %%V via py launcher
        )
    )
)
if not defined PYCMD (
    where python >nul 2>&1
    if !errorlevel! == 0 (
        set "PYCMD=python"
        echo Using default python on PATH
        python -c "import sys; print('Detected', sys.version)"
        python -c "import sys; sys.exit(0 if sys.version_info[:2] in [(3,10),(3,11),(3,12),(3,13)] else 1)"
        if !errorlevel! neq 0 (
            echo.
            echo WARNING: PyQt5 / VTK do not have wheels for Python 3.14+ yet.
            echo The GUI will likely fail to install. Recommended: install Python 3.12 from
            echo https://www.python.org/downloads/release/python-3128/ and re-run this script.
            echo.
        )
    )
)
if not defined PYCMD (
    echo.
    echo ERROR: No Python found. Install Python 3.12 from
    echo https://www.python.org/downloads/release/python-3128/
    echo and tick "Add python.exe to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo.
echo === Installing dependencies ===
%PYCMD% -m pip install --upgrade pip
%PYCMD% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Dependency install failed. If PyQt5 or VTK is the culprit, install
    echo Python 3.12 from python.org and re-run this script.
    pause
    exit /b 1
)

echo.
echo === Building synthetic DICOM phantom ===
%PYCMD% -c "import sys; sys.path.insert(0, '.'); from tests.synthetic import save_synthetic_dicom_series, make_synthetic_volume; from pathlib import Path; save_synthetic_dicom_series(Path('sample_data/synthetic'), make_synthetic_volume()); print('OK: 96 DICOM files in sample_data\\synthetic')"
if errorlevel 1 (
    echo Phantom build failed.
    pause
    exit /b 1
)

echo.
echo === Sanity check: running tests ===
%PYCMD% -m pytest -q
if errorlevel 1 (
    echo.
    echo Tests failed -- the GUI may still work, continue?  Press Ctrl+C to abort.
    pause
)

REM Persist the chosen Python command so launcher scripts can reuse it.
echo %PYCMD% > .pycmd

echo.
echo ============================================================
echo Setup complete.
echo.
echo To launch the viewer:        run.bat
echo To run headless scoring:     score.bat
echo To regenerate a screenshot:  mockup.bat
echo ============================================================
echo.
pause
