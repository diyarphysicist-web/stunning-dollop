@echo off
REM Headless Agatston calcium score on a folder of DICOMs.
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
    echo DICOM folder:  score.bat C:\path\to\dicoms
    pause
    exit /b 1
)

%PYCMD% run.py score "%TARGET%"
pause
