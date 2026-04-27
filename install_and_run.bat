@echo off
REM One-click bootstrap: clones the repo if needed, runs setup.bat, launches GUI.
setlocal enabledelayedexpansion

set "REPO_URL=https://github.com/diyarphysicist-web/stunning-dollop.git"
set "BRANCH=claude/coronary-ct-dicom-viewer-kduFz"
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo === Coronary CTA Viewer one-click installer ===
echo.

REM --- 1. Make sure git is available ---
where git >nul 2>&1
if errorlevel 1 (
    echo git is not installed or not on PATH.
    echo Install Git for Windows from https://git-scm.com/download/win
    pause
    exit /b 1
)

REM --- 2. Clone if necessary ---
if not exist "stunning-dollop\python\run.py" (
    if not exist "stunning-dollop" (
        echo Cloning repository...
        git clone %REPO_URL%
        if errorlevel 1 (
            echo git clone failed.
            pause
            exit /b 1
        )
    )
    cd stunning-dollop
    git checkout %BRANCH%
    if errorlevel 1 (
        echo git checkout failed.
        pause
        exit /b 1
    )
    cd ..
)

REM --- 3. Run setup ---
cd "stunning-dollop\python"
call setup.bat
if errorlevel 1 (
    exit /b 1
)

REM --- 4. Launch the viewer ---
echo.
echo Launching GUI...
call run.bat
