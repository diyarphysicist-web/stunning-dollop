@echo off
REM Launches the GUI on the synthetic phantom (or any folder you pass in).
setlocal enabledelayedexpansion
cd /d "%~dp0"

if exist .pycmd (
    set /p PYCMD=<.pycmd
) else (
    set "PYCMD=python"
)

if "%~1"=="" (
    set "TARGET=sample_data\synthetic"
) else (
    set "TARGET=%~1"
)

if not exist "%TARGET%" (
    echo Folder "%TARGET%" not found.
    echo Run setup.bat first to build the synthetic phantom, or pass a real
    echo DICOM folder:  run.bat C:\path\to\dicoms
    pause
    exit /b 1
)

echo Launching GUI with %PYCMD% on %TARGET% ...
%PYCMD% run.py "%TARGET%"
