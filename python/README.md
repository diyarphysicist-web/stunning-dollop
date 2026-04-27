# Coronary CT Angiography Viewer (Python)

A full-featured desktop viewer for cardiac CT studies, written in pure
Python on top of `pydicom`, `numpy`, `scipy`, `PyQt5`, `pyqtgraph` and
`VTK`. Targeted at radiology research and teaching — **not** cleared
for clinical use.

## Feature overview

| Area | Capabilities |
|------|--------------|
| DICOM I/O | Recursive series discovery, multi-series studies, sorted assembly via `ImagePositionPatient` × `ImageOrientationPatient`, modality LUT (rescale slope/intercept), 4D cardiac phase detection. |
| Display | 4-pane layout: axial / coronal / sagittal MPR plus 3D volume rendering, with a CPR strip across the bottom. Synced crosshair across all panes; mouse-wheel scroll; aspect-correct rendering using DICOM spacing. |
| Window/Level | 13 cardiac CT presets (Cardiac, Coronary, Angio, Mediastinum, Soft Tissue, Lung, Bone, Brain, Calcium, Liver, PE, Stent, Full Range), plus auto-window from percentiles. |
| Reformation | Orthogonal MPR, oblique / double-oblique sampling with arbitrary plane orientation, thin/thick slab projections (MIP / MinIP / AvgIP / SumIP), rotating MIP cine. |
| Curved planar reformation | Stretched and rotational CPR, perpendicular cross-sections under cursor, automatic min/eq/max diameter at every cross-section. |
| Vessel tools | Manual anchor → spline centerline; Frangi-vesselness map (multi-scale Hessian); Dijkstra centerline tracking between two voxels using 26-connected graph. |
| Calcium scoring | Standard Agatston score (130 HU threshold, weights 1–4), volume score (mm³), mass score (mg, with adjustable calibration), per-territory breakdown, risk category. |
| 3D volume rendering | VTK GPU/CPU smart mapper; presets for Vessel CTA / Bone / Soft tissue / MIP; toggle shading. |
| Measurements | Distance, angle, ROI statistics (mean / std / min / max / area). |
| Cine | Playback of multi-phase 4D cardiac CT at adjustable fps. |
| Export | Current slice → PNG, full slice cine or phase cine → MP4. |
| CLI | `ccta-viewer score <folder>` for headless Agatston scoring. |

## Project layout

```
python/
├── ccta_viewer/
│   ├── core/             # pure-numpy / scipy algorithms (no Qt)
│   │   ├── volume.py
│   │   ├── dicom_loader.py
│   │   ├── windowing.py
│   │   ├── mpr.py
│   │   ├── mip.py
│   │   ├── cpr.py
│   │   ├── centerline.py
│   │   ├── calcium_scoring.py
│   │   └── measurements.py
│   ├── ui/               # PyQt5 widgets
│   │   ├── main_window.py
│   │   ├── mpr_view.py
│   │   ├── cpr_view.py
│   │   ├── volume_view.py
│   │   ├── series_panel.py
│   │   ├── metadata_panel.py
│   │   ├── calcium_panel.py
│   │   └── window_level_widget.py
│   ├── utils/
│   │   ├── image_utils.py
│   │   └── export.py
│   └── main.py           # console entry point
├── tests/                # pytest, runs headless (no GUI required)
│   ├── synthetic.py      # builds a test phantom + writes DICOMs
│   └── test_volume.py
├── requirements.txt
├── setup.py
└── run.py
```

## Quick start (Windows)

If you don't already have the repo, double-click **`install_and_run.bat`**
in the repo root — it clones, sets up, and launches the viewer for you.

If you already have the repo, from inside the `python\` folder:

```bat
setup.bat        :: pick a Python (prefers 3.12), pip install, build the phantom, run tests
run.bat          :: launch the GUI on the synthetic phantom
run.bat C:\my\dicoms     :: launch the GUI on a real folder
score.bat        :: headless Agatston report on the phantom
score.bat C:\my\dicoms   :: headless Agatston report on a real folder
mockup.bat       :: regenerate docs\viewer_screenshot.png
```

The setup script auto-selects Python 3.12 / 3.11 / 3.13 / 3.10 if any
of them is installed via the `py` launcher, falling back to whatever
`python` is on `PATH`. PyQt5 has no wheels for Python 3.14 yet, so if
you only have 3.14 installed `setup.bat` will warn you and recommend
installing 3.12 from python.org.

## Quick start (macOS / Linux)

```bash
cd python
pip install -r requirements.txt
python run.py                          # empty viewer
python run.py /data/cardiac_study      # pre-scan a folder
python run.py score /data/cardiac/cs   # headless Agatston report
```

VTK is optional; without it the 3D pane shows a placeholder and every
other feature continues to work.

## Testing

```bash
cd python
pytest -q
```

The test suite generates a synthetic helical "vessel with plaque"
phantom, writes it as a DICOM series, and exercises the loader, MPR,
oblique sampling, slab projections, centerline spline + Dijkstra
tracker, CPR, calcium scoring, and measurements.

## Performance notes

* The MPR panes index numpy slices directly — no copy on scroll.
* Oblique and CPR sampling use `scipy.ndimage.map_coordinates` with
  trilinear interpolation; vectorised across the entire reformat.
* Vesselness uses Cardano's closed-form 3×3 eigenvalues, which keeps
  the multi-scale Frangi pass on a 256³ volume under a few seconds on
  a laptop.
* The 3D pane uses VTK's `vtkSmartVolumeMapper` so it picks GPU ray
  casting when available and falls back to CPU ray casting otherwise.

## Disclaimers

The viewer is a research / teaching tool. The Agatston implementation
is faithful to the original Agatston *et al.* (1990) definition and
the volume / mass scores follow Hong *et al.* (2002), but no scanner-
specific calibration phantom is included. Do not use for clinical
decision-making.
