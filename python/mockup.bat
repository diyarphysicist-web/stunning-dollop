@echo off
REM Regenerate the mockup screenshot under docs\viewer_screenshot.png.
setlocal enabledelayedexpansion
cd /d "%~dp0"

if exist .pycmd (
    set /p PYCMD=<.pycmd
) else (
    set "PYCMD=python"
)

%PYCMD% tests\render_mockup.py
if errorlevel 1 (
    pause
    exit /b 1
)
echo.
echo Wrote docs\viewer_screenshot.png
pause
