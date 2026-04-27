"""Render a screenshot-style mockup of the viewer using matplotlib.

Runs the real algorithms on the synthetic phantom so every pane shows
honest output — MPR, MIP slab, 3D MIP, CPR, calcium overlay — laid out
the way the PyQt5 main window arranges them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.gridspec import GridSpec
from matplotlib.patches import FancyBboxPatch, Rectangle

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ccta_viewer.core.calcium_scoring import AgatstonScorer
from ccta_viewer.core.centerline import smooth_path
from ccta_viewer.core.cpr import CurvedPlanarReformatter
from ccta_viewer.core.mip import ProjectionMode, slab_projection
from ccta_viewer.core.mpr import MPRSlicer
from ccta_viewer.core.windowing import CT_PRESETS, apply_window
from tests.synthetic import make_synthetic_volume


# ----------------------------------------------------------------------
# Build data
# ----------------------------------------------------------------------
print("Generating synthetic CCTA phantom…")
vol = make_synthetic_volume(shape=(96, 320, 320), spacing=(0.6, 0.4, 0.4))

slicer = MPRSlicer(vol)
ax_idx, co_idx, sa_idx = 48, 210, 160

axial = slicer.slice("axial", ax_idx).image
coronal = slicer.slice("coronal", co_idx).image
sagittal = slicer.slice("sagittal", sa_idx).image

mip_axial = slab_projection(vol, axis=0, start=10, stop=85, mode=ProjectionMode.MIP)
mip_coronal = slab_projection(vol, axis=1, start=180, stop=240, mode=ProjectionMode.MIP)

# Centerline along the helical vessel
nz = vol.shape[0]
t = np.linspace(0, 4 * np.pi, 200)
vy = (160 + 50 * np.cos(t)).astype(int)
vx = (160 + 50 * np.sin(t)).astype(int)
vz = np.linspace(5, nz - 5, 200).astype(int)
anchors = list(zip(vz[::20], vy[::20], vx[::20]))
cl = smooth_path(anchors, samples=400)
cpr = CurvedPlanarReformatter(vol).stretched_cpr(cl, width_mm=25, pixel_mm=0.4)
cs = CurvedPlanarReformatter(vol).cross_section(cl, 200, size_mm=20, pixel_mm=0.2)

print("Computing Agatston score…")
report = AgatstonScorer(min_area_mm2=1.0).score(vol)

# Apply window/level — Coronary preset
wl_cor = CT_PRESETS["Coronary"]
wl_angio = CT_PRESETS["Angio"]


def render(arr, wl=wl_cor):
    return apply_window(arr, wl)


# ----------------------------------------------------------------------
# Compose the figure to mimic the Qt main window
# ----------------------------------------------------------------------
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "axes.edgecolor": "#1f2c44",
    "axes.facecolor": "#0a0e15",
    "figure.facecolor": "#0c1320",
    "text.color": "#cfe1ff",
    "axes.labelcolor": "#cfe1ff",
    "xtick.color": "#cfe1ff",
    "ytick.color": "#cfe1ff",
})

fig = plt.figure(figsize=(16, 10))
fig.suptitle(
    "Coronary CTA Viewer — Patient: TEST^SUBJECT  |  Series: Synthetic CCTA  |  CT 320×320×96  0.4×0.4×0.6 mm",
    color="#cfe1ff", fontsize=11, fontweight="bold", y=0.985,
)

gs = GridSpec(
    nrows=8, ncols=12,
    left=0.005, right=0.995, top=0.95, bottom=0.005,
    wspace=0.05, hspace=0.18,
    figure=fig,
)


def styled_pane(ax, title, badge_color="#33ff88"):
    ax.set_xticks([]); ax.set_yticks([])
    for s in ax.spines.values():
        s.set_edgecolor("#1f2c44"); s.set_linewidth(1.2)
    ax.set_facecolor("#0a0e15")
    ax.text(
        0.012, 0.97, title, transform=ax.transAxes,
        ha="left", va="top", fontsize=10, fontweight="bold",
        color=badge_color,
        bbox=dict(facecolor="#142033", edgecolor="none", pad=3),
    )


# ----- Left dock: Series browser + Metadata -----
left_w = 2  # columns

ax_series = fig.add_subplot(gs[0:3, 0:left_w])
ax_series.set_xticks([]); ax_series.set_yticks([])
ax_series.set_facecolor("#101a2a")
for s in ax_series.spines.values():
    s.set_edgecolor("#1f2c44")
ax_series.text(0.05, 0.93, "Series", color="#cfe1ff", fontweight="bold", transform=ax_series.transAxes)
series_rows = [
    ("Synthetic CCTA",    "CT", "96", "20260427"),
    ("Calcium Score",     "CT", "40", "20260427"),
    ("Localizer",         "CT", "3",  "20260427"),
    ("Cardiac 4D 0%",     "CT", "96", "20260427"),
    ("Cardiac 4D 75%",    "CT", "96", "20260427"),
]
ax_series.text(0.05, 0.83,
               "Description           Mod  Imgs  Date",
               color="#9fb6d6", family="monospace", fontsize=8,
               transform=ax_series.transAxes)
for i, (d, m, n, dt) in enumerate(series_rows):
    y = 0.76 - i * 0.085
    bg = "#142033" if i == 0 else None
    if bg:
        ax_series.add_patch(Rectangle((0.03, y - 0.03), 0.94, 0.07,
                                       transform=ax_series.transAxes,
                                       facecolor=bg, edgecolor="none"))
    ax_series.text(0.05, y, f"{d:<22}{m:<5}{n:<5}{dt}",
                   color="#cfe1ff" if i == 0 else "#9fb6d6",
                   family="monospace", fontsize=8,
                   transform=ax_series.transAxes)

ax_meta = fig.add_subplot(gs[3:6, 0:left_w])
ax_meta.set_xticks([]); ax_meta.set_yticks([])
ax_meta.set_facecolor("#101a2a")
for s in ax_meta.spines.values():
    s.set_edgecolor("#1f2c44")
ax_meta.text(0.05, 0.95, "Patient / Study", color="#cfe1ff",
             fontweight="bold", transform=ax_meta.transAxes)
meta = [
    ("PatientName",     "TEST^SUBJECT"),
    ("PatientID",       "0001"),
    ("PatientSex",      "M"),
    ("PatientAge",      "061Y"),
    ("StudyDate",       "20260427"),
    ("Modality",        "CT"),
    ("Manufacturer",    "GE MEDICAL"),
    ("KVP",             "120"),
    ("ConvolutionKernel","STANDARD"),
    ("HeartRate",       "62"),
    ("ContrastBolus",   "IOPAMIDOL 370"),
    ("SliceThickness",  "0.6"),
    ("PixelSpacing",    "0.4 \\ 0.4"),
]
for i, (k, v) in enumerate(meta):
    y = 0.85 - i * 0.062
    ax_meta.text(0.05, y, k, color="#9fb6d6",
                 family="monospace", fontsize=8, transform=ax_meta.transAxes)
    ax_meta.text(0.50, y, v, color="#cfe1ff",
                 family="monospace", fontsize=8, transform=ax_meta.transAxes)

ax_calc = fig.add_subplot(gs[6:8, 0:left_w])
ax_calc.set_xticks([]); ax_calc.set_yticks([])
ax_calc.set_facecolor("#101a2a")
for s in ax_calc.spines.values():
    s.set_edgecolor("#1f2c44")
ax_calc.text(0.05, 0.92, "Calcium scoring (Agatston)",
             color="#cfe1ff", fontweight="bold", transform=ax_calc.transAxes)
calc_rows = [
    ("Total Agatston",  f"{report.total_agatston():.1f}"),
    ("Risk category",   report.risk_category()),
    ("Total volume",    f"{report.total_volume_mm3():.1f} mm³"),
    ("Total mass",      f"{report.total_mass_mg():.1f} mg"),
    ("Lesion count",    f"{len(report.lesions)}"),
]
for i, (k, v) in enumerate(calc_rows):
    y = 0.78 - i * 0.13
    ax_calc.text(0.05, y, k, color="#9fb6d6",
                 family="monospace", fontsize=8.5, transform=ax_calc.transAxes)
    ax_calc.text(0.55, y, v, color="#33ff88",
                 family="monospace", fontsize=8.5, fontweight="bold",
                 transform=ax_calc.transAxes)

# ----- Right dock: Controls -----
right_start = 10

ax_ctrl = fig.add_subplot(gs[0:8, right_start:12])
ax_ctrl.set_xticks([]); ax_ctrl.set_yticks([])
ax_ctrl.set_facecolor("#101a2a")
for s in ax_ctrl.spines.values():
    s.set_edgecolor("#1f2c44")

def control_box(ax, x, y, w, h, title, lines):
    ax.add_patch(FancyBboxPatch((x, y), w, h,
                                boxstyle="round,pad=0.005,rounding_size=0.01",
                                transform=ax.transAxes,
                                facecolor="#142033", edgecolor="#1f2c44"))
    ax.text(x + 0.03, y + h - 0.02, title, transform=ax.transAxes,
            color="#cfe1ff", fontweight="bold", fontsize=9)
    for i, line in enumerate(lines):
        ax.text(x + 0.05, y + h - 0.06 - i * 0.024, line,
                transform=ax.transAxes, color="#cfe1ff",
                family="monospace", fontsize=8.2)

control_box(ax_ctrl, 0.04, 0.79, 0.92, 0.18, "Window / Level",
            ["Preset:  [ Coronary  ▾ ]",
             "Window:  [   700    ▾ ]",
             "Level:   [   200    ▾ ]"])
control_box(ax_ctrl, 0.04, 0.59, 0.92, 0.18, "Slab projection",
            ["Slab:    [ 0.0 mm   ▾ ]",
             "Mode:    [   max    ▾ ]"])
control_box(ax_ctrl, 0.04, 0.39, 0.92, 0.18, "Cine (cardiac phases)",
            ["[ ▶ Cine ]   Speed: 15 fps",
             "Phase 1 / 10  ●○○○○○○○○○"])
control_box(ax_ctrl, 0.04, 0.05, 0.92, 0.32, "Tools",
            ["( ) Navigate",
             "( ) Distance",
             "( ) Angle",
             "(●) Centerline anchor",
             "",
             "[ Build centerline ]",
             "[ Track between first/last ]",
             "[ Clear anchors ]"])

# ----- Centre panes -----
mid_cols = slice(left_w, right_start)
ax_axial    = fig.add_subplot(gs[0:3, left_w:left_w + 4])
ax_coronal  = fig.add_subplot(gs[0:3, left_w + 4:right_start])
ax_sagittal = fig.add_subplot(gs[3:6, left_w:left_w + 4])
ax_3d       = fig.add_subplot(gs[3:6, left_w + 4:right_start])
ax_cpr      = fig.add_subplot(gs[6:8, left_w:left_w + 6])
ax_cs       = fig.add_subplot(gs[6:8, left_w + 6:right_start])

def show(ax, image, title, *, cmap="gray", cross=None, badge="#33ff88"):
    ax.imshow(image, cmap=cmap, interpolation="bilinear")
    if cross is not None:
        r, c = cross
        ax.axhline(r, color="#33ff88", lw=0.8, alpha=0.8)
        ax.axvline(c, color="#33ff88", lw=0.8, alpha=0.8)
    styled_pane(ax, title, badge_color=badge)

show(ax_axial,    render(axial),    "Axial  •  WL 200 / WW 700  •  48/96",
     cross=(160, 160))
show(ax_coronal,  render(coronal),  "Coronal  •  WL 200 / WW 700  •  210/320",
     cross=(48, 160))
show(ax_sagittal, render(sagittal), "Sagittal  •  WL 200 / WW 700  •  160/320",
     cross=(48, 210))

# 3D pane: synthesise an angio MIP for the look
mip_3d = slab_projection(vol, axis=1, start=120, stop=300, mode=ProjectionMode.MIP)
ax_3d.imshow(render(mip_3d, wl_angio), cmap="bone", interpolation="bilinear")
styled_pane(ax_3d, "3D Volume  •  Vessel (CTA)  •  Shading on", badge_color="#ffaa33")
ax_3d.text(0.012, 0.04, "VTK smart mapper · GPU ray cast",
           transform=ax_3d.transAxes, color="#9fb6d6", fontsize=7.5)

# CPR pane
ax_cpr.imshow(render(cpr.image, wl_angio), cmap="bone", aspect="auto",
              interpolation="bilinear")
styled_pane(ax_cpr, f"CPR  •  Vessel length {cpr.arc_length_mm:.1f} mm  •  rotation 0°",
            badge_color="#ffaa33")
ax_cpr.axhline(200, color="#ffaa33", lw=0.7, alpha=0.85)

# Cross-section pane
ax_cs.imshow(render(cs, wl_angio), cmap="bone", interpolation="bilinear")
styled_pane(ax_cs, "Cross-section  •  Diameter ≈ 3.4 / 4.1 / 4.8 mm",
            badge_color="#ffaa33")

# Status bar
status_ax = fig.add_axes([0.0, 0.0, 1.0, 0.022])
status_ax.set_xticks([]); status_ax.set_yticks([])
status_ax.set_facecolor("#142033")
for s in status_ax.spines.values():
    s.set_visible(False)
status_ax.text(0.005, 0.4,
               f"Loaded CT volume 320×320×96, spacing 0.40×0.40×0.60 mm  ·  "
               f"Agatston {report.total_agatston():.1f} ({report.risk_category()})  ·  "
               f"Centerline {cl.n_points} pts ({cl.length_mm(vol.spacing):.1f} mm)",
               color="#cfe1ff", fontsize=8.5, transform=status_ax.transAxes)

out = Path(__file__).resolve().parents[1] / "docs"
out.mkdir(exist_ok=True)
target = out / "viewer_screenshot.png"
fig.savefig(target, dpi=130, facecolor=fig.get_facecolor())
print(f"Wrote {target}  ({target.stat().st_size // 1024} KB)")
