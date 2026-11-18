# SOUP list (software of unknown provenance)

Rule: nothing GPL or AGPL ships in the product. Status `in use` = present in a lockfile; `planned` = named in the architecture, added in the phase shown. Versions are the locked versions; the CI licence job regenerates a full inventory (`pip-licenses`, `pnpm licenses`) and the CycloneDX SBOM on every build.

| Component | Version | Licence | Purpose | Status | Known anomalies relevant to use |
|---|---|---|---|---|---|
| Python (CPython) | 3.12.x | PSF-2.0 | Engine runtime | in use | — |
| NumPy | 2.5.x | BSD-3-Clause | Arrays, numerics | in use | — |
| SciPy | 1.18.x | BSD-3-Clause | Fitting, filters, statistics | in use | — |
| pydicom | 3.0.x | MIT | DICOM read/write | in use | — |
| zod | 4.x | MIT | IPC/REST schema validation | in use | — |
| TypeScript | 5.9.x | Apache-2.0 | Build tool (not shipped) | in use | — |
| FastAPI, Uvicorn | latest | MIT, BSD-3-Clause | Engine HTTP/WebSocket API | planned (2a) | — |
| numba | latest | BSD-2-Clause | JIT for hot loops | planned (3) | — |
| SimpleITK | 2.x | Apache-2.0 | Registration, N4 | planned (4) | — |
| ANTsPy (antspyx) | latest | Apache-2.0 | Registration | planned (4) | Wheel size; verify Windows wheels |
| DIPY | 1.x | BSD-3-Clause | Tensor fit, tracking, IVIM/DKI | planned (4) | — |
| nilearn | 0.x | BSD-3-Clause | GLM, HRF, design matrices | planned (7) | — |
| scikit-image | 0.x | BSD-3-Clause | Region growing, morphology | planned (4) | — |
| highdicom | 0.x | MIT | SC, SEG, SR, Parametric Map | planned (2a) | — |
| pynetdicom | 2.x | MIT | DIMSE SCU/SCP | planned (2c) | — |
| Electron | LTS | MIT (Chromium: BSD-3 and others) | Desktop shell | planned (2a) | Track Chromium security releases |
| React | 19.x | MIT | UI | planned (2a) | — |
| Zustand | 5.x | MIT | State | planned (2a) | — |
| TanStack Table | 8.x | MIT | Result tables | planned (2a) | — |
| Radix UI | latest | MIT | Accessible primitives | planned (2a) | — |
| uPlot | 1.x | MIT | Curves and graphs | planned (2a) | — |
| Cornerstone3D | 3.x | MIT | Viewports, MPR, tools | planned (2a) | — |
| dicom-parser, dcmjs | latest | MIT | Client DICOM parsing | planned (2a) | — |
| VTK.js | latest | BSD-3-Clause | 3D rendering, streamlines | planned (6) | — |
| better-sqlite3 | latest | MIT | Study index | planned (2a) | Native module, rebuild per Electron ABI |
| PyInstaller | 6.x | GPL-2.0 **with bootloader exception** | Freezing the engine (build tool) | planned (2c) | Bootloader exception permits distribution of frozen apps; record legal review |
