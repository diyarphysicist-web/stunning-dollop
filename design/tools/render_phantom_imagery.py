"""Render design imagery from the synthetic phantoms (Phase 1 design assets).

Usage (repository root, after `pnpm phantoms`):
    uv run --project engine --with pillow python design/tools/render_phantom_imagery.py [--phantoms data/phantoms] [--out design/assets]

Reads the phantom DICOM series written by scripts/make_phantoms.py, computes quick
illustrative maps with numpy (these are design previews, not the validated engine
algorithms), and writes:
    <out>/img/*.png      grayscale slices, LUT maps (opaque and alpha overlays), RGB maps
    <out>/data/*.json    curves, spectra, table values and window ranges used by the screens
    <out>/luts.css       LUT gradients and ROI/mismatch palette as CSS custom properties
LUT control points and palettes are parsed from packages/viewer/src/luts/index.ts so the
design and the app share one source of data colours.

Source: the anatomical brain phantom (scripts/make_phantoms.py --only brain, folders brain_*):
one skull-stripped head with GM, WM, CSF and ventricles, a right-MCA stroke (core and delayed,
hypoperfused tissue), a left frontal enhancing tumour, MS-like lesions and task activation. Lesions,
deficits and ROIs come from the phantom's truth and the maps computed here, never from shapes
painted onto the images. Perfusion and mismatch volumes are measured over all slices.

Design-only misalignment: the 3D volumes are the FLAIR baseline and follow-up
(128 × 128 × 96, 1.5 mm). The co-registration screen fuses the follow-up (input)
onto the baseline (reference) after applying a known residual rigid offset
(COREG_RESIDUAL_*) so that the review state has something to correct.

Echo Accumulation reads the brain multi-echo GRE (4 echoes). FLAIR* reads the brain SWI/EPI
with the baseline FLAIR: the SWI/EPI is registered to the FLAIR by an in-plane rigid search
(a design preview of the engine registration), both are normalised by their 99th percentile in
the brain, and the product is shown in three planes around lesion L1.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pydicom
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
UPSAMPLE_TO = 512

COREG_RESIDUAL_SHIFT_MM = (0.0, -1.5, 2.5)  # (z, y, x)
COREG_RESIDUAL_ROT_DEG = 2.0  # about the z axis


def pad_square(a: np.ndarray) -> np.ndarray:
    """Pad a 2D image with zeros to a centred square."""
    n = max(a.shape)
    out = np.zeros((n, n), a.dtype)
    y0, x0 = (n - a.shape[0]) // 2, (n - a.shape[1]) // 2
    out[y0 : y0 + a.shape[0], x0 : x0 + a.shape[1]] = a
    return out


# ── LUTs from the viewer package ──────────────────────────────────────────────
def load_luts() -> tuple[dict[str, list[str]], list[str], dict[str, str]]:
    src = (ROOT / "packages/viewer/src/luts/index.ts").read_text(encoding="utf-8")
    block = re.search(r"CONTROL_POINTS[^{]*\{(.*?)\n\};", src, re.S)
    assert block, "CONTROL_POINTS not found"
    luts = {m.group(1): re.findall(r'"(#[0-9A-Fa-f]{6})"', m.group(2)) for m in re.finditer(r"(\w+):\s*\[([^\]]*)\]", block.group(1))}
    roi_block = re.search(r"ROI_PALETTE[^=]*=\s*\[(.*?)\]", src, re.S)
    roi = re.findall(r'"(#[0-9A-Fa-f]{6})"', roi_block.group(1)) if roi_block else []
    assert len(roi) == 8, f"expected 8 ROI colours, found {len(roi)}"
    mm = dict(re.findall(r'(core|deficit|penumbra):\s*"(#[0-9A-Fa-f]{6})"', src))
    dirs = re.search(r"FA_DIRECTION_PALETTE\s*=\s*\{([^}]*)\}", src)
    mm |= {f"dir-{k}": v for k, v in re.findall(r'(rl|ap|si):\s*"(#[0-9A-Fa-f]{6})"', dirs.group(1))} if dirs else {}
    planes = re.search(r"PLANE_PALETTE\s*=\s*\{([^}]*)\}", src)
    mm |= {f"plane-{k}": v for k, v in re.findall(r'(axial|coronal|sagittal):\s*"(#[0-9A-Fa-f]{6})"', planes.group(1))} if planes else {}
    return luts, roi, mm


def build_lut(points: list[str], size: int = 256) -> np.ndarray:
    pts = np.array([[int(p[i : i + 2], 16) for i in (1, 3, 5)] for p in points], dtype=float)
    pos = np.linspace(0, len(pts) - 1, size)
    k = np.minimum(np.floor(pos).astype(int), len(pts) - 2)
    f = (pos - k)[:, None]
    return np.round(pts[k] + (pts[k + 1] - pts[k]) * f).astype(np.uint8)


# ── DICOM loading ─────────────────────────────────────────────────────────────
def load_series(folder: Path) -> tuple[np.ndarray, list[pydicom.Dataset]]:
    """Return data shaped (n, z, y, x) in instance order (k outer, z inner) plus headers."""
    files = sorted(folder.glob("*.dcm"))
    ds = sorted((pydicom.dcmread(f) for f in files), key=lambda d: int(d.InstanceNumber))
    nz = len({round(float(d.ImagePositionPatient[2]), 3) for d in ds})
    arr = np.stack([d.pixel_array * float(d.RescaleSlope) + float(d.RescaleIntercept) for d in ds])
    n = len(ds) // nz
    return arr.reshape(n, nz, *arr.shape[1:]), ds


# ── Image helpers ─────────────────────────────────────────────────────────────
def up(img: np.ndarray, order: int = 1) -> np.ndarray:
    factor = UPSAMPLE_TO / img.shape[0]
    if img.ndim == 3:
        return np.stack([ndimage.zoom(img[..., c], factor, order=order) for c in range(img.shape[2])], axis=-1)
    return ndimage.zoom(img, factor, order=order)


def window(img: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.clip((img - lo) / max(hi - lo, 1e-12), 0, 1)


def save_gray(path: Path, img: np.ndarray, lo: float | None = None, hi: float | None = None) -> tuple[float, float]:
    if lo is None:
        lo = float(np.percentile(img, 1))
    if hi is None:
        fg = img[img > 0.2 * img.max()]
        # uniform phantom tissue sits at ~60 % gray instead of saturating white
        hi = float(max(np.percentile(img, 99.5), 1.6 * np.median(fg))) if fg.size else float(img.max())
    Image.fromarray((window(up(img), lo, hi) * 255).astype(np.uint8), "L").save(path)
    return lo, hi


def save_map(path: Path, img: np.ndarray, mask: np.ndarray, lut: np.ndarray, lo: float, hi: float, alpha: bool = False) -> None:
    v = window(up(img), lo, hi)
    m = up(mask.astype(float), order=0) > 0.5
    rgb = lut[(v * 255).astype(int)]
    if alpha:
        a = np.where(m, 255, 0).astype(np.uint8)
        Image.fromarray(np.dstack([rgb, a]), "RGBA").save(path)
    else:
        rgb[~m] = 0
        Image.fromarray(rgb, "RGB").save(path)


def save_overlay_on_gray(path: Path, gray: np.ndarray, glo: float, ghi: float, ov: np.ndarray, show: np.ndarray, lut: np.ndarray, lo: float, hi: float, opacity: float = 0.85) -> None:
    g = window(up(gray), glo, ghi)[..., None] * 255
    v = window(up(ov), lo, hi)
    s = up(show.astype(float), order=0) > 0.5
    rgb = lut[(v * 255).astype(int)].astype(float)
    out = np.where(s[..., None], (1 - opacity) * g + opacity * rgb, g)
    Image.fromarray(out.astype(np.uint8), "RGB").save(path)


def r(x: float, n: int = 3) -> float:
    return float(np.round(float(x), n))


PALETTE: dict[str, np.ndarray] = {}  # mismatch colours, filled in main() from the viewer LUT module
DTI_CACHE: dict = {}  # tensor results shared by dti() and tractography()
ROI_RGB: list[np.ndarray] = []  # ROI palette as RGB, filled in main()


def hexrgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], float)


def seed_px(mask: np.ndarray) -> list[float]:
    """Centroid of a voxel mask in 512-px image coordinates (x, y)."""
    if not mask.any():
        return [0.0, 0.0]
    cy, cx = ndimage.center_of_mass(mask)
    f = UPSAMPLE_TO / mask.shape[0]
    return [r((cx + 0.5) * f, 1), r((cy + 0.5) * f, 1)]


def class_centres_px(labels: np.ndarray) -> dict[str, list[float]]:
    """Centroid (x, y) in 512-px image coordinates for each tissue class label >= 0."""
    return {f"class{int(k)}": seed_px(labels == k) for k in np.unique(labels) if k >= 0}


def segmentation_overlay(rgb: np.ndarray, mask: np.ndarray, colour: np.ndarray, fill: float) -> np.ndarray:
    """Blend a voxel mask onto a 512-px RGB image as a light fill plus a 2-px outline."""
    mu = up(mask.astype(float), 0) > 0.5
    edge = mu & ~ndimage.binary_erosion(mu, iterations=2)
    out = np.where(mu[..., None], (1 - fill) * rgb + fill * colour, rgb)
    out = np.where(edge[..., None], colour, out)
    return out.astype(np.uint8)


# ── DSC ───────────────────────────────────────────────────────────────────────
def bolus_window(c: np.ndarray, frac: float = 0.15) -> np.ndarray:
    """Boolean mask of the contiguous first-pass window around the peak (above frac × peak)."""
    k = int(np.argmax(c))
    thr = frac * float(c[k])
    below = c < thr
    start = k
    while start > 0 and not below[start - 1]:
        start -= 1
    end = k
    while end < len(c) - 1 and not below[end + 1]:
        end += 1
    w = np.zeros(len(c), bool)
    w[start : end + 1] = True
    return w


def dsc_params(c: np.ndarray, times: np.ndarray) -> dict[str, float]:
    """Model-free moments of one baseline-corrected ΔR2* curve (DSC-012 style)."""
    if c.max() <= 0:
        return {"area": 0.0, "mtt": 0.0, "t0": 0.0, "ttp": 0.0}
    w = bolus_window(c)
    t0 = float(times[np.argmax(w)])
    cc = np.where(w, c, 0.0)
    area = float(np.trapezoid(cc, times))
    mtt = float(np.trapezoid(cc * np.clip(times - t0, 0, None), times) / max(area, 1e-9))
    return {"area": area, "mtt": mtt, "t0": t0, "ttp": float(times[np.argmax(c)])}


def mm_box(shape: tuple[int, int], px: float, x_mm: float, y_mm: float, h: int, w: int) -> list[int]:
    """Voxel box [y0, y1, x0, x1] of h × w voxels centred on (x, y) [mm] from the image centre."""
    ny, nx = shape
    cy = int(round((ny - 1) / 2 + y_mm / px))
    cx = int(round((nx - 1) / 2 + x_mm / px))
    return [cy - h // 2, cy - h // 2 + h, cx - w // 2, cx - w // 2 + w]


def dsc(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "brain_dsc" / "dicom")
    truth = np.load(ph / "brain_dsc" / "truth.npz")
    te = float(ds[0].EchoTime) / 1000.0
    nz, ny, nx = arr.shape[1:]
    px = float(ds[0].PixelSpacing[0])
    times = np.array([float(d.TriggerTime) / 1000.0 for d in ds[::nz]])
    n, dt = len(times), float(times[1] - times[0])
    s0 = arr[:5].mean(0)
    mask = s0 > 0.15 * np.percentile(s0, 99)
    labels = truth["labels"]
    tissue3 = mask & (labels >= 2) & (labels <= 7)  # GM and WM incl. the stroke, no CSF or artery
    with np.errstate(divide="ignore", invalid="ignore"):
        dr2 = np.where(mask, -np.log(np.clip(arr, 1e-6, None) / np.clip(s0, 1e-6, None)) / te, 0.0)
    dr2 = dr2 - dr2[:5].mean(0)
    z = int(truth["display_slice"])
    # perfused tissue: a first-pass bolus well above noise (CSF and background have none)
    peak = ndimage.uniform_filter(dr2[:, z], size=(1, 3, 3)).max(0)
    m = mask[z] & (peak > 0.25 * np.median(peak[mask[z]]))
    # voxel maps: 5×5 display smoothing of the curves, then model-free moments (DSC-012)
    sm = ndimage.uniform_filter(dr2[:, z], size=(1, 5, 5))
    area = np.zeros((ny, nx))
    mtt = np.zeros((ny, nx))
    t0 = np.zeros((ny, nx))
    ttp = np.zeros((ny, nx))
    for iy, ix in zip(*np.nonzero(m), strict=True):
        p = dsc_params(sm[:, iy, ix], times)
        area[iy, ix], mtt[iy, ix], t0[iy, ix], ttp[iy, ix] = p["area"], p["mtt"], p["t0"], p["ttp"]
    # block-circulant SVD deconvolution with the phantom's AIF (Tmax and relCBF previews)
    aif = truth["aif_dr2"]
    npad = 2 * n
    a = np.concatenate([aif, np.zeros(npad - n)])
    circ = np.array([np.roll(a, k) for k in range(npad)]).T * dt
    u, sv, vt = np.linalg.svd(circ)
    inv = (vt.T * np.where(sv > 0.2 * sv.max(), 1 / sv, 0)) @ u.T

    def residue(curves: np.ndarray) -> np.ndarray:
        return inv @ np.concatenate([curves, np.zeros((npad - n, curves.shape[1]))])

    res_all = residue(ndimage.uniform_filter(dr2, size=(1, 1, 5, 5)).reshape(n, -1))[:n]
    tmax3 = np.where(mask, (np.argmax(res_all, 0) * dt).reshape(nz, ny, nx), 0)
    tmax = tmax3[z]
    cbf_raw = res_all.max(0).reshape(nz, ny, nx)[z]
    # absolute scale (Manual AIF + deconvolution only, DSC-013): healthy cortex = phantom GM truth
    gm = m & (labels[z] == 2) & (area > 0)
    cbv_scale = float(truth["cbv"][2]) / float(np.median(area[gm]))
    cbf_scale = float(truth["cbf"][2]) / float(np.median(cbf_raw[gm]))
    rel_cbv = np.where(m, area * cbv_scale, 0)
    rel_cbf = np.where(m, cbf_raw * cbf_scale, 0)

    windows: dict[str, list[float]] = {}
    glo, ghi = save_gray(img / "dsc_source_dyn01.png", arr[0, z])
    pk_dyn = int(np.argmax(dr2[:, z][:, m].mean(1)))
    save_gray(img / "dsc_source_peak.png", arr[pk_dyn, z], glo, ghi)
    windows["source"] = [r(glo, 1), r(ghi, 1)]
    for name, mp, lo, hi, lut in (
        ("relcbv", rel_cbv, 0.0, 8.0, "stroke"),
        ("relcbf", rel_cbf, 0.0, 80.0, "stroke"),
        ("mtt", mtt, 0.0, 14.0, "blueToRed"),
        ("ttp", ttp, 10.0, 40.0, "blueToRed"),
        ("tmax", tmax, 0.0, 12.0, "stroke"),
        ("t0", t0, 5.0, 25.0, "blueToRed"),
    ):
        save_map(img / f"dsc_{name}.png", mp, m, luts[lut], lo, hi)
        save_map(img / f"dsc_{name}_overlay.png", mp, m, luts[lut], lo, hi, alpha=True)
        windows[name] = [r(lo, 2), r(hi, 2)]
    save_gray(img / "dsc_relcbv_gray.png", rel_cbv, 0, 8)

    # ROIs: ROI1 on the hypoperfused region, its mirror, ROI2 in healthy left parieto-occipital tissue
    lz = labels[z]
    yy, xx = np.nonzero((lz >= 4) & (lz <= 7))
    cy_mm = (yy.mean() - (ny - 1) / 2) * px
    cx_mm = (xx.mean() - (nx - 1) / 2) * px
    boxes = {
        "roi1": mm_box((ny, nx), px, cx_mm, cy_mm, 14, 10),
        "roi1_mirror": mm_box((ny, nx), px, -cx_mm, cy_mm, 14, 10),
        "roi2": mm_box((ny, nx), px, 24.0, 34.0, 8, 12),
    }

    def ellipse(b: list[int]) -> np.ndarray:
        """Elliptical ROI inscribed in the voxel box [y0, y1, x0, x1]."""
        yy, xx = np.mgrid[0:ny, 0:nx]
        cy, cx = (b[0] + b[1] - 1) / 2, (b[2] + b[3] - 1) / 2
        return ((yy - cy) / ((b[1] - b[0]) / 2)) ** 2 + ((xx - cx) / ((b[3] - b[2]) / 2)) ** 2 <= 1

    def roi_curve(b: list[int]) -> np.ndarray:
        return dr2[:, z][:, ellipse(b)].mean(1)

    table = {}
    curves = {"times_s": [r(t, 2) for t in times], "aif_truth": [r(v, 3) for v in aif]}
    for key, b in boxes.items():
        c = roi_curve(b)
        p = dsc_params(c, times)
        rr = residue(c[:, None])[:n, 0]
        table[key] = {
            "relCBV": r(p["area"] * cbv_scale, 2),
            "relCBF": r(rr.max() * cbf_scale, 1),
            "relCBV_au": r(p["area"], 1),
            "relCBF_au": r(p["area"] / max(p["mtt"], 1e-9), 2),
            "MTT": r(p["mtt"], 2),
            "TTP": r(p["ttp"], 1),
            "T0": r(p["t0"], 1),
            "Tmax": r(np.argmax(rr) * dt, 1),
            "voxels": int(ellipse(b).sum()),
        }
        curves[key] = [r(v, 3) for v in c]
    curves["signal_roi1"] = [r(v, 1) for v in arr[:, z][:, ellipse(boxes["roi1"])].mean(1)]
    # 7×7 AIF box centred on the strongest early, narrow arterial curve outside the hypoperfused region
    pk = dr2[:, z].max(0)
    early = np.argmax(dr2[:, z], 0) <= np.argmax(aif) + 1
    cand = np.where(m & early & ~((lz >= 4) & (lz <= 7)), pk, 0)
    by, bx = np.unravel_index(np.argmax(cand), cand.shape)
    by, bx = int(np.clip(by, 3, ny - 4)), int(np.clip(bx, 3, nx - 4))
    box = dr2[:, z, by - 3 : by + 4, bx - 3 : bx + 4]
    selected = sorted(int(i) for i in np.argsort(box.max(0).ravel())[-6:])
    vox_ml = px * px * float(ds[0].SliceThickness) / 1000.0
    data["dsc"] = {
        "slice": z + 1,
        "slices": nz,
        "dynamics": n,
        "tr_s": r(dt, 2),
        "te_ms": r(te * 1000, 1),
        "pixel_mm": r(px, 2),
        "slice_mm": r(float(ds[0].SliceThickness), 1),
        "matrix": [ny, nx],
        "peak_dynamic": pk_dyn + 1,
        "windows": windows,
        "au_per_ml_cbv": r(1 / cbv_scale, 2),
        "au_per_ml_cbf": r(1 / cbf_scale, 4),
        "curves": curves,
        "table": table,
        "roi_boxes_vox": boxes,
        "aif_box": {
            "center_yx": [by, bx],
            "curves": [[r(v, 2) for v in box[:, i // 7, i % 7]] for i in range(49)],
            "selected": selected,
            "average": [r(v, 3) for v in box.reshape(n, 49)[:, selected].mean(1)],
        },
        "truth": {k: [r(v, 2) for v in truth[k]] for k in ("cbf", "cbv", "mtt", "delay")},
    }
    # Tmax > 6 s deficit in tissue (all slices), largest connected component
    deficit3 = ndimage.binary_opening((tmax3 > 6.0) & tissue3, structure=np.ones((1, 3, 3)), iterations=1)
    lab3, nlab = ndimage.label(deficit3)
    if nlab:
        deficit3 = lab3 == (1 + int(np.argmax(ndimage.sum(deficit3, lab3, range(1, nlab + 1)))))
    deficit = deficit3[z]
    np.save(img.parent / "data" / "_deficit.npy", deficit3)
    np.save(img.parent / "data" / "_deficit_px.npy", np.array([px, vox_ml]))
    save_overlay_on_gray(img / "dsc_tmax_on_source.png", arr[0, z], glo, ghi, tmax, deficit, luts["stroke"], 0, 12, 0.7)
    tmax_rgb = np.repeat(window(up(tmax), 0, 12)[..., None] * 255, 3, axis=2)
    Image.fromarray(segmentation_overlay(tmax_rgb, deficit, PALETTE["deficit"], 0.35), "RGB").save(img / "mismatch_deficit_on_tmax.png")
    mir = deficit[:, ::-1] & ~deficit & m
    data["dsc"]["mismatch"] = {
        "deficit_seed_px": seed_px(deficit),
        "deficit_voxels_slice": int(deficit.sum()),
        "deficit_ml": r(float(deficit3.sum()) * vox_ml, 1),
        "signal_deficit": [r(v, 1) for v in arr[:, z][:, deficit].mean(1)],
        "signal_contra": [r(v, 1) for v in arr[:, z][:, mir].mean(1)],
    }


# ── DTI / diffusion ───────────────────────────────────────────────────────────
TRK_SLICE = 6  # DTI slice (z 24.5 mm) through the corpus callosum body and the corticospinal tracts beside it


def dti(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray], mm: dict[str, str]) -> None:
    arr, ds = load_series(ph / "brain_dti_32dir" / "dicom")
    truth = np.load(ph / "brain_dti_32dir" / "truth.npz")
    nz, ny, nx = arr.shape[1:]
    hdr = ds[::nz]
    bvals = np.array([float(d.DiffusionBValue) for d in hdr])
    bvecs = np.array([[float(v) for v in d.DiffusionGradientOrientation] if "DiffusionGradientOrientation" in d else [0, 0, 0] for d in hdr])
    z = int(truth["display_slice"])
    px = float(ds[0].PixelSpacing[0])
    s3 = np.clip(arr, 1e-3, None)
    b03 = s3[bvals == 0].mean(0)
    mask3 = b03 > 0.15 * np.percentile(b03, 99)
    g = bvecs
    design = np.column_stack([np.ones(len(bvals)), -bvals * g[:, 0] ** 2, -bvals * g[:, 1] ** 2, -bvals * g[:, 2] ** 2,
                              -2 * bvals * g[:, 0] * g[:, 1], -2 * bvals * g[:, 0] * g[:, 2], -2 * bvals * g[:, 1] * g[:, 2]])
    coef, *_ = np.linalg.lstsq(design, np.log(s3.reshape(len(bvals), -1)), rcond=None)
    dxx, dyy, dzz, dxy, dxz, dyz = coef[1:]
    tens = np.stack([np.stack([dxx, dxy, dxz], -1), np.stack([dxy, dyy, dyz], -1), np.stack([dxz, dyz, dzz], -1)], -2)
    ev, evec = np.linalg.eigh(tens)
    ev = np.clip(ev[:, ::-1], 0, None)
    e1_3 = evec[:, :, -1].reshape(nz, ny, nx, 3)
    md3 = ev.mean(1).reshape(nz, ny, nx) * mask3
    with np.errstate(divide="ignore", invalid="ignore"):
        fa3 = np.sqrt(1.5 * ((ev - ev.mean(1)[:, None]) ** 2).sum(1) / np.maximum((ev**2).sum(1), 1e-20)).reshape(nz, ny, nx) * mask3
        ra3 = (np.sqrt(((ev - ev.mean(1)[:, None]) ** 2).sum(1) / 3) / np.maximum(ev.mean(1), 1e-20)).reshape(nz, ny, nx) * mask3
    ad3, rd3 = ev[:, 0].reshape(nz, ny, nx) * mask3, ev[:, 1:].mean(1).reshape(nz, ny, nx) * mask3
    mask, b0, s = mask3[z], b03[z], s3[:, z]
    fa, md, ra, ad, rd = fa3[z], md3[z], ra3[z], ad3[z], rd3[z]
    adc_e6 = md * 1e6
    bmax = bvals.max()
    dwi_iso = b0 * np.exp(-bmax * md)
    eadc = np.exp(-bmax * md) * mask
    glo, ghi = save_gray(img / "dti_b0.png", b0)
    save_gray(img / "dti_bmax.png", s[np.argmax(bvals)])
    save_gray(img / "dti_dwi_iso.png", dwi_iso * mask)
    save_gray(img / "dti_fa.png", fa, 0, 1)
    save_gray(img / "dti_adc.png", adc_e6, 0, 3000)
    save_gray(img / "dti_eadc.png", eadc, 0, 1)
    save_gray(img / "dti_ad.png", ad * 1e6, 0, 3000)
    save_gray(img / "dti_rd.png", rd * 1e6, 0, 3000)
    save_gray(img / "dti_ra.png", ra, 0, 1.2)
    t = TRK_SLICE
    DTI_CACHE.update(e1=e1_3[t], fa=fa3[t], adc_e6=md3[t] * 1e6, mask=mask3[t], labels=truth["labels"][t], px=px, z_mm=float(truth["slice_z_mm"][t]))
    col = np.abs(e1_3[z]) * fa[..., None]
    Image.fromarray((np.clip(up(col, 0), 0, 1) * 255).astype(np.uint8), "RGB").save(img / "dti_fa_direction.png")
    # Mismatch core: ADC < 620e-6 mm²/s in brain tissue (all slices), paired with the DSC Tmax > 6 s deficit
    tissue3 = mask3 & (truth["labels"] >= 2)
    core3 = ndimage.binary_opening((md3 * 1e6 < 620) & tissue3, structure=np.ones((1, 3, 3)))
    deficit3 = np.load(img.parent / "data" / "_deficit.npy") & mask3
    core, deficit = core3[z], deficit3[z]
    g = window(up(b0), glo, ghi)[..., None] * 255
    cu = up(core.astype(float), 0) > 0.5
    du = up(deficit.astype(float), 0) > 0.5
    yy, xx = np.mgrid[0 : cu.shape[0], 0 : cu.shape[1]]
    hatch = ((xx + yy) // 6) % 2 == 0
    out = g.copy()
    pen = du & ~cu
    out = np.where((pen & hatch)[..., None], 0.35 * out + 0.65 * hexrgb(mm["penumbra"]), out)
    out = np.where(cu[..., None], 0.35 * out + 0.65 * hexrgb(mm["core"]), out)
    Image.fromarray(out.astype(np.uint8), "RGB").save(img / "mismatch_penumbra_on_b0.png")
    adc_rgb = np.repeat(window(up(adc_e6), 0, 3000)[..., None] * 255, 3, axis=2)
    Image.fromarray(segmentation_overlay(adc_rgb, core, PALETTE["core"], 0.35), "RGB").save(img / "mismatch_core_on_adc.png")
    vox_ml = px**2 * float(ds[0].SliceThickness) / 1000.0
    perf_ml, diff_ml = float(deficit3.sum()) * vox_ml, float(core3.sum()) * vox_ml
    lab = truth["labels"][z]
    inner = lambda k: ndimage.binary_erosion((lab == k) & mask)  # noqa: E731  (away from partial volume)
    names = {"gm": 2, "wm_ap": 3, "wm_rl": 4, "wm_si": 5, "core": 6}
    data["dti"] = {
        "bvals": sorted({int(b) for b in bvals}),
        "directions": int((bvals > 0).sum()),
        "slices": nz,
        "slice": z + 1,
        "slice_mm": r(float(ds[0].SliceThickness), 1),
        "matrix": [int(ds[0].Rows), int(ds[0].Columns)],
        "pixel_mm": r(px, 2),
        "tissue": {k: {"fa_truth": r(truth["fa"][v], 3), "md_truth_e6": r(truth["md"][v] * 1e6, 0),
                       "fa": r(fa[(lab == v) & mask].mean(), 3) if ((lab == v) & mask).any() else None,
                       "adc_e6": r(adc_e6[(lab == v) & mask].mean(), 0) if ((lab == v) & mask).any() else None}
                   for k, v in names.items()},
        "csf_adc_e6": r(float(np.median(adc_e6[inner(1)])), 0),
        "deep_gm_adc_e6": r(float(np.median(adc_e6[inner(2)])), 0),
        "wm_adc_e6": r(float(np.median(adc_e6[inner(3)])), 0),
        "adc_window_e6": [0, 3000],
        "b0_window": [r(glo, 1), r(ghi, 1)],
        "mismatch": {
            "perfusion_ml": r(perf_ml, 1),
            "diffusion_ml": r(diff_ml, 1),
            "mismatch_ml": r(perf_ml - diff_ml, 1),
            "ratio_pct": r(100 * (perf_ml - diff_ml) / max(perf_ml, 1e-9), 1),
            "ratio": r(perf_ml / max(diff_ml, 1e-9), 2),
            "core_mean_adc_e6": r(adc_e6[core].mean() if core.any() else 0, 0),
            "core_seed_px": seed_px(core),
            "core_voxels_slice": int(core.sum()),
            "deficit_voxels_slice": int(deficit.sum()),
            "penumbra_mean_adc_e6": r(adc_e6[deficit & ~core].mean() if (deficit & ~core).any() else 0, 0),
            "regions": {
                name: {
                    "slice_cm2": [r(float(m3[k].sum()) * px * px / 100.0, 2) for k in range(nz)],
                    "ml": r(float(m3.sum()) * vox_ml, 1),
                    "mean_adc_e6": r(float(md3[m3].mean()) * 1e6, 0) if m3.any() else 0,
                }
                for name, m3 in (("core", core3), ("deficit", deficit3), ("penumbra", deficit3 & ~core3))
            },
        },
    }


# ── Advanced diffusion (IVIM / DKI) ───────────────────────────────────────────
def ivim(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "brain_ivim_dki" / "dicom")
    truth = np.load(ph / "brain_ivim_dki" / "truth.npz")
    nz = arr.shape[1]
    bvals = np.array([float(d.DiffusionBValue) for d in ds[::nz]])
    z = int(truth["display_slice"])
    s = np.clip(arr[:, z], 1e-3, None)
    mask = s[0] > 0.15 * np.percentile(s[0], 99)
    hi = (bvals >= 200) & (bvals <= 1000)
    p = np.polyfit(bvals[hi], np.log(s[hi].reshape(hi.sum(), -1)), 1)
    d = np.clip(-p[0], 0, None).reshape(s.shape[1:]) * mask
    f = np.clip(1 - np.exp(p[1]).reshape(s.shape[1:]) / s[0], 0, 1) * mask
    lab = np.clip(truth["labels"][z], 0, None)
    save_gray(img / "ivim_b0.png", s[0])
    save_map(img / "ivim_d.png", d * 1e6, mask, luts["blueToRed"], 0, 3000)
    save_map(img / "ivim_f.png", f * 100, mask, luts["blueToRed"], 0, 30)
    save_map(img / "ivim_dstar.png", np.where(mask, truth["dstar"][lab] * 1e3, 0), mask, luts["blueToRed"], 0, 50)
    save_map(img / "ivim_k.png", np.where(mask, truth["k"][lab], 0), mask, luts["blueToRed"], 0, 2)
    s0 = np.exp(p[1]).reshape(s.shape[1:])
    save_gray(img / "ivim_cdwi_b1400.png", s0 * np.exp(-1400 * d) * mask)
    # ROI1 on the stroke core (restricted diffusion), 6 × 6 voxels
    yy, xx = np.nonzero(lab == 4)
    cy, cx = int(round(yy.mean())), int(round(xx.mean()))
    roi = (slice(cy - 3, cy + 3), slice(cx - 3, cx + 3))
    data["ivim"] = {
        "bvals": [int(b) for b in bvals],
        "slice": z + 1,
        "slices": nz,
        "matrix": [int(ds[0].Rows), int(ds[0].Columns)],
        "pixel_mm": r(float(ds[0].PixelSpacing[0]), 2),
        "roi1_box_vox": [cy - 3, cy + 3, cx - 3, cx + 3],
        "roi1_centre_px": [r((cx + 0.0) / s.shape[2] * UPSAMPLE_TO, 1), r((cy + 0.0) / s.shape[1] * UPSAMPLE_TO, 1)],
        "signal_roi1": [r(v, 1) for v in s[:, roi[0], roi[1]].mean((1, 2))],
        "fit": {"D_e6": r(d[roi].mean() * 1e6, 0), "f_pct": r(f[roi].mean() * 100, 1)},
        "truth": {k: [r(v, 5) for v in truth[k]] for k in ("d", "f", "dstar", "k")},
    }


# ── DCE semi-quantitative and Tofts ───────────────────────────────────────────
# DCE and permeability ROIs [mm from the image centre]: centre (x, y), semi-axes (x, y).
# ROI1 on the lateral enhancing rim of the left frontal tumour, ROI2 in its necrotic centre,
# ROI3 in contralateral (right) frontal white matter.
DCE_ROI_MM = {"roi1": ((48.5, -40.0), (2.6, 4.5)), "roi2": ((38.0, -40.0), (3.6, 3.6)), "roi3": ((-28.0, -22.0), (5.4, 7.2))}


def ellipse_rois(shape: tuple[int, int], px: float) -> dict[str, tuple[np.ndarray, dict]]:
    """Masks and 512-px overlay geometry of the DCE ROIs."""
    ny, nx = shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    s = UPSAMPLE_TO / nx
    out = {}
    for key, ((x, y), (ax, ay)) in DCE_ROI_MM.items():
        cx, cy = (nx - 1) / 2 + x / px, (ny - 1) / 2 + y / px
        m = ((xx - cx) / (ax / px)) ** 2 + ((yy - cy) / (ay / px)) ** 2 <= 1
        out[key] = (m, {"cx": r((cx + 0.5) * s, 1), "cy": r((cy + 0.5) * s, 1), "rx": r(ax / px * s, 1), "ry": r(ay / px * s, 1),
                        "voxels": int(m.sum()), "area_mm2": r(float(m.sum()) * px * px, 0)})
    return out


def dce(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "brain_dce_semiquant" / "dicom")
    truth = np.load(ph / "brain_dce_semiquant" / "truth.npz")
    nz = arr.shape[1]
    times = np.array([float(d.TriggerTime) / 1000.0 for d in ds[::nz]])
    z = int(truth["display_slice"])
    s = arr[:, z]
    mask = s[0] > 0.15 * np.percentile(s[0], 99)
    with np.errstate(divide="ignore", invalid="ignore"):
        relenh = np.where(mask, (s / np.maximum(s[0], 1e-6) - 1) * 100, 0)
    maxrel = relenh.max(0)
    src = int(np.argmax(relenh[:, truth["labels"][z] == 4].mean(1)))
    glo, ghi = save_gray(img / "dce_source.png", s[src])
    save_gray(img / "dce_dyn01.png", s[0], glo, ghi)
    save_gray(img / "dce_subtracted.png", (s[src] - s[0]) * mask)
    save_map(img / "dce_maxrelenh.png", maxrel, mask, luts["blueToRed"], 0, float(np.percentile(maxrel[mask], 99.5)))
    save_map(img / "dce_ttp.png", times[np.argmax(s, 0)], mask, luts["blueToRed"], float(times.min()), float(times.max()))
    lab = truth["labels"][z]
    rois = ellipse_rois(lab.shape, float(ds[0].PixelSpacing[0]))
    data["dce"] = {
        "times_s": [r(t, 1) for t in times],
        "dynamics": len(times),
        "slice": z + 1,
        "slices": nz,
        "matrix": [int(ds[0].Rows), int(ds[0].Columns)],
        "pixel_mm": r(float(ds[0].PixelSpacing[0]), 2),
        "curves": {f"class{k}": [r(v, 1) for v in s[:, lab == k].mean(1)] for k in range(len(truth["s0"])) if (lab == k).any()},
        "rois": {k: g for k, (_, g) in rois.items()},
        "roi_curves": {k: [r(v, 1) for v in s[:, m].mean(1)] for k, (m, _) in rois.items()},
        "maxrelenh_window": [0, r(np.percentile(maxrel[mask], 99.5), 0)],
        "class_centres_px": class_centres_px(np.where(mask, lab, -1)),
        "source_dynamic": src + 1,
        "truth": {k: [r(v, 3) for v in truth[k]] for k in ("s0", "s1", "t0", "t1", "washin", "washout", "maxenh", "maxrelenh")},
    }
    arr2, ds2 = load_series(ph / "brain_dce_tofts" / "dicom_dce")
    tr = np.load(ph / "brain_dce_tofts" / "truth.npz")
    nz2 = arr2.shape[1]
    z2 = int(tr["display_slice"])
    t2 = np.array([float(d.TriggerTime) / 1000.0 for d in ds2[::nz2]])
    lab2 = tr["labels"][z2]
    m2 = lab2 >= 2  # GM, WM and the tumour (no CSF or background)
    save_gray(img / "perm_source.png", arr2[-1, z2])
    for key, lo, hi_ in (("ktrans", 0, 0.3), ("kep", 0, 1.5), ("ve", 0, 0.6), ("vp", 0, 0.1)):
        vals = tr[key][np.clip(lab2, 0, None)]
        save_map(img / f"perm_{key}.png", np.where(m2, vals, 0), m2, luts["stroke"], lo, hi_)
    vfa5, _ = load_series(ph / "brain_dce_tofts" / "dicom_vfa5")
    vfa15, _ = load_series(ph / "brain_dce_tofts" / "dicom_vfa15")
    save_gray(img / "perm_vfa5.png", vfa5[0, z2])
    save_gray(img / "perm_vfa15.png", vfa15[0, z2])
    save_map(img / "perm_t1.png", np.where(lab2 >= 1, tr["t1"][np.clip(lab2, 0, None)], 0), lab2 >= 1, luts["blueToRed"], 500, 2500)
    rois2 = ellipse_rois(lab2.shape, float(ds2[0].PixelSpacing[0]))
    data["perm"] = {
        "times_s": [r(t, 1) for t in t2],
        "dynamics": len(t2),
        "slice": z2 + 1,
        "slices": nz2,
        "tr_ms": r(float(ds2[0].RepetitionTime), 1),
        "te_ms": r(float(ds2[0].EchoTime), 1),
        "flip_deg": r(float(ds2[0].FlipAngle), 0),
        "aif_cp": [r(v, 3) for v in tr["aif_cp"]],
        "tissue_curves": {f"class{k}": [r(v, 1) for v in arr2[:, z2][:, lab2 == k].mean(1)] for k in range(len(tr["ktrans"])) if (lab2 == k).any()},
        "rois": {k: g for k, (_, g) in rois2.items()},
        "roi_curves": {k: [r(v, 1) for v in arr2[:, z2][:, m].mean(1)] for k, (m, _) in rois2.items()},
        "class_centres_px": class_centres_px(lab2),
        "matrix": [int(ds2[0].Rows), int(ds2[0].Columns)],
        "pixel_mm": r(float(ds2[0].PixelSpacing[0]), 2),
        "truth": {k: [r(v, 4) for v in tr[k]] for k in ("ktrans", "kep", "ve", "vp", "t1")},
    }


# ── fMRI ──────────────────────────────────────────────────────────────────────
def fmri(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "brain_fmri_block" / "dicom")
    nz = arr.shape[1]
    n = arr.shape[0]
    tr = float(ds[0].RepetitionTime) / 1000.0
    t = np.arange(n) * tr
    truth = np.load(ph / "brain_fmri_block" / "truth.npz")
    box = np.zeros(n)
    for o, d in zip(truth["onsets"], truth["durations"], strict=True):
        box[(t >= o) & (t < o + d)] = 1
    th = np.arange(0, 30, tr)
    hrf = (th**5 * np.exp(-th)) / 120 - (th**15 * np.exp(-th)) / (6 * 1.307674368e12)
    reg = np.convolve(box, hrf)[:n]
    reg = (reg - reg.mean()) / reg.std()
    x = np.column_stack([reg, np.ones(n), np.linspace(-1, 1, n)])
    y = arr.reshape(n, -1)
    beta, *_ = np.linalg.lstsq(x, y, rcond=None)
    resid = y - x @ beta
    sigma2 = (resid**2).sum(0) / (n - x.shape[1])
    c = np.array([1, 0, 0])
    var_c = c @ np.linalg.inv(x.T @ x) @ c
    tmap = (beta[0] / np.sqrt(np.maximum(sigma2 * var_c, 1e-12))).reshape(arr.shape[1:])
    brain = truth["brain"]
    tmap = np.where(brain, tmap, 0)
    mean = arr.mean(0)
    # T >= 3.1 and clusters of >= 10 voxels (26-connected), as the screen's thresholds state
    lab3, ncl = ndimage.label(tmap >= 3.1, structure=np.ones((3, 3, 3)))
    sizes = ndimage.sum(np.ones_like(tmap), lab3, range(1, ncl + 1)) if ncl else np.zeros(0)
    keep = np.isin(lab3, 1 + np.where(sizes >= 10)[0])
    biggest = lab3 == (1 + int(np.argmax(sizes))) if ncl else np.zeros_like(keep)
    slices = []
    for zz in range(nz):
        glo, ghi = save_gray(img / f"fmri_epi_z{zz + 1}.png", mean[zz])
        save_overlay_on_gray(img / f"fmri_t_z{zz + 1}.png", mean[zz], glo, ghi, tmap[zz], keep[zz], luts["hot"], 3.1, 12, 0.8)
        slices.append(zz + 1)
    act = truth["active"]
    cl = keep.any(0)
    data["fmri"] = {
        "dynamics": n,
        "tr_s": r(tr, 2),
        "slices": nz,
        "onsets_s": [r(v, 1) for v in truth["onsets"]],
        "durations_s": [r(v, 1) for v in truth["durations"]],
        "t_threshold": [3.1, 12.0],
        "t_max": r(tmap[keep].max() if keep.any() else 0, 1),
        "active_voxels_truth": int(act.sum()),
        "active_voxels_t31": int(keep.sum()),
        "clusters": int((sizes >= 10).sum()),
        "cluster_voxels": int(biggest.sum()),
        "cluster_curve": [r(v, 1) for v in arr[:, biggest].mean(1)] if biggest.any() else [],
        "paradigm": [int(v) for v in box],
        "cluster_slice_extent": [int(i + 1) for i in np.where(biggest.any((1, 2)))[0]],
        "slice_active_voxels": [int(keep[k].sum()) for k in range(nz)],
        "has_active": bool(cl.any()),
    }


# ── FLAIR follow-up ───────────────────────────────────────────────────────────
def flair(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    base, ds = load_series(ph / "brain_flair_baseline" / "dicom")
    fu, _ = load_series(ph / "brain_flair_followup" / "dicom")
    b, f = base[0], fu[0]
    nz = b.shape[0]
    vox_ml = float(ds[0].PixelSpacing[0]) ** 2 * float(ds[0].SliceThickness) / 1000.0
    lesions = match_lesions(b, f, vox_ml)
    # lesion voxels from the phantom truth (class 4), split into lesions by the nearest matched centre
    lb = np.load(ph / "brain_flair_baseline" / "truth.npz")["labels"] == 4
    lf = np.load(ph / "brain_flair_followup" / "truth.npz")["labels"] == 4
    zz, yy, xx = np.mgrid[0:nz, 0 : b.shape[1], 0 : b.shape[2]]
    cen = np.array([les["centre_zyx"] for les in lesions])
    near = np.argmin(sum((g[..., None] - cen[:, k]) ** 2 for k, g in enumerate((zz, yy, xx))), axis=-1)
    # display slice: shows the most lesions at either time point; ties go to the larger lesion area
    seen = [(len({int(v) for v in near[k][lb[k] | lf[k]]}), int((lb[k] | lf[k]).sum())) for k in range(nz)]
    z = max(range(nz), key=lambda k: seen[k])
    px512 = UPSAMPLE_TO / b.shape[2]
    for i, les in enumerate(lesions):
        for key, m in (("base", lb[z]), ("follow", lf[z])):
            sel = m & (near[z] == i)
            les[f"outline_{key}"] = None if sel.sum() < 2 else {
                "cx": r((xx[z][sel].mean() + 0.5) * px512, 1), "cy": r((yy[z][sel].mean() + 0.5) * px512, 1),
                "r": r(np.sqrt(sel.sum() / np.pi) * px512 + 4, 1),  # outline drawn just outside the lesion edge
            }
    glo, ghi = save_gray(img / "flair_baseline.png", b[z])
    save_gray(img / "flair_followup.png", f[z], glo, ghi)
    # synthetic intermediate time points for the 4-study layout: same phantom, lesions interpolated
    for k, w in ((1, 1 / 3), (2, 2 / 3)):
        save_gray(img / f"flair_tp{k + 1}.png", (1 - w) * b[z] + w * f[z], glo, ghi)
    diff = f[z] - b[z]
    lo_d, hi_d = np.percentile(diff, [0.01, 99.99])
    rng = float(max(abs(lo_d), abs(hi_d))) or 1.0
    thr = 0.1 * float(hi_d - lo_d)
    save_overlay_on_gray(img / "flair_changemap.png", b[z], glo, ghi, diff, np.abs(diff) > thr, luts["blueToRed"], -rng, rng, 0.8)
    # coronal / sagittal reformats of the follow-up for reference views
    # isotropic voxels: true aspect, superior at the top, padded to a square tile
    save_gray(img / "flair_followup_cor.png", pad_square(f[::-1, f.shape[1] // 2, :]), glo, ghi)
    save_gray(img / "flair_followup_sag.png", pad_square(f[::-1, :, f.shape[2] // 2 + 4]), glo, ghi)
    tb = np.load(ph / "brain_flair_baseline" / "truth.npz")["volumes_vox"]
    tf = np.load(ph / "brain_flair_followup" / "truth.npz")["volumes_vox"]
    data["flair"] = {
        "slice": z + 1,
        "slices": nz,
        "voxel_ml": r(vox_ml, 4),
        "lesion_volumes_ml_baseline": [r(v * vox_ml, 2) for v in tb],
        "lesion_volumes_ml_followup": [r(v * vox_ml, 2) for v in tf],
        "change_threshold": r(thr, 1),
        "change_window": [r(-rng, 1), r(rng, 1)],
        "lesions": lesions,
        "window": [r(glo, 1), r(ghi, 1)],
    }


# ── Echo Accumulation (multi_echo_gre phantom) ────────────────────────────────
def echo(ph: Path, img: Path, data: dict) -> None:
    arr, ds = load_series(ph / "brain_multi_echo_gre" / "dicom")
    te = sorted({float(d.EchoTime) for d in ds})
    z = data["flair"]["slice"] - 1  # same slice as the FLAIR screens (same head grid)
    elo, ehi = save_gray(img / "echo_e1.png", arr[0, z])
    total = arr[:, z].sum(0)
    slo, shi = save_gray(img / "echo_sum.png", total)
    data["echo"] = {
        "te_ms": te,
        "slice": z + 1,
        "slices": arr.shape[1],
        "window_e1": [r(elo, 1), r(ehi, 1)],
        "window_sum": [r(slo, 1), r(shi, 1)],
    }


# ── FLAIR* (swi_epi phantom + baseline FLAIR) ─────────────────────────────────
def flair_star(ph: Path, img: Path, data: dict) -> None:
    swi = load_series(ph / "brain_swi_epi" / "dicom")[0][0]
    fl, ds = load_series(ph / "brain_flair_baseline" / "dicom")
    fl = fl[0]
    px = float(ds[0].PixelSpacing[0])

    def mask(v: np.ndarray) -> np.ndarray:
        return v > 0.5 * np.median(v[v > 0.2 * v.max()])

    fm = mask(fl)
    l1 = next(x for x in data["flair"]["lesions"] if x["name"] == "L1")
    cz, cy, cx = (int(round(v)) for v in l1["centre_zyx"])
    slab = slice(max(cz - 12, 0), cz + 12)  # registration search on a slab around L1 (design preview)
    # contrast differs (cortex is bright on FLAIR, dark on SWI): match edge strength, not intensity
    def edges(v: np.ndarray) -> np.ndarray:
        return np.hypot(ndimage.sobel(v, 1), ndimage.sobel(v, 2))

    fz_ = edges(fl[slab])
    fz_ = (fz_ - fz_.mean()) / fz_.std()
    swe = edges(swi[slab])
    best = (-1.0, 0.0, 0.0)
    for dy in np.arange(-3, 3.01, 0.25):
        for dx in np.arange(-3, 3.01, 0.25):
            m = ndimage.shift(swe, (0, dy, dx), order=1)
            ncc = float(((m - m.mean()) / m.std() * fz_).mean())  # normalised cross-correlation
            if ncc > best[0]:
                best = (ncc, dy, dx)
    _, dy, dx = best
    reg = ndimage.shift(swi, (0, dy, dx), order=1)
    brain = fm

    def norm(v: np.ndarray) -> np.ndarray:
        return np.clip(v / np.percentile(v[brain], 99), 0, None)

    prod = norm(reg) * norm(fl) * brain
    h = 16  # 32-voxel crops (48 mm) around L1
    zf = fl.shape[0] - 1 - cz  # row of L1 after flipping z (superior at the top)

    def planes(v: np.ndarray) -> dict[str, np.ndarray]:
        f = v[::-1]
        return {
            "ax": v[cz, cy - h : cy + h, cx - h : cx + h],
            "cor": f[zf - h : zf + h, cy, cx - h : cx + h],
            "sag": f[zf - h : zf + h, cy - h : cy + h, cx],  # anterior on the left
        }

    windows = {}
    for name, vol in (("swi", reg), ("flair", fl), ("prod", prod)):
        pl = planes(vol)
        lo, hi = save_gray(img / f"fstar_{name}_ax.png", pl["ax"])
        for k in ("cor", "sag"):
            save_gray(img / f"fstar_{name}_{k}.png", pl[k], lo, hi)
        windows[name] = [r(lo, 2), r(hi, 2)]
    save_gray(img / "swi_epi.png", swi[data["flair"]["slice"] - 1])  # Directory thumbnail
    # smallest diameter of L1 from its FLAIR segmentation (threshold 1.5 × median tissue), for LBA-026
    seg, _ = ndimage.label(fl > 1.5 * np.median(fl[fm]))
    comp = seg == seg[cz, cy, cx]
    extents = [int(np.ptp(np.nonzero(comp)[ax])) + 1 for ax in range(3)]
    min_diam_mm = min(extents) * px
    nz = fl.shape[0]
    data["flair_star"] = {
        "lesion": "L1",
        "min_diameter_mm": r(min_diam_mm, 1),
        "centre_slice": {"ax": cz + 1, "cor": cy + 1, "sag": cx + 1},
        "slices": {"ax": nz, "cor": fl.shape[1], "sag": fl.shape[2]},
        "crop_vox": 2 * h,
        "zoom_pct": int(round(100 * fl.shape[2] / (2 * h))),
        "shift_mm": [r(-dy * px, 1), r(-dx * px, 1)],  # SWI/EPI displacement (y, x) found by the search
        "ncc": r(best[0], 3),
        "windows": windows,
        "baseline_lesions": [x["name"] for x in data["flair"]["lesions"] if x["ml_base"] > 0],
    }


def match_lesions(b: np.ndarray, f: np.ndarray, vox_ml: float) -> list[dict]:
    """Bright lesions in both time points (threshold 1.5 × median tissue), matched by centroid distance."""
    def find(v: np.ndarray) -> list[tuple[np.ndarray, int]]:
        m = v > 1.5 * np.median(v[v > 0.2 * v.max()])
        lab, n = ndimage.label(m)
        cms = ndimage.center_of_mass(m, lab, range(1, n + 1))
        return [(np.array(c), int(s)) for c, s in zip(cms, ndimage.sum(m, lab, range(1, n + 1)), strict=True)]

    out: list[dict] = []
    for when, found in (("base", find(b)), ("follow", find(f))):
        for c, vox in found:
            hit = next((x for x in out if np.linalg.norm(np.array(x["centre_zyx"]) - c) < 3), None)
            if hit is None:
                hit = {"centre_zyx": [r(v, 1) for v in c], "ml_base": 0.0, "ml_follow": 0.0}
                out.append(hit)
            hit[f"ml_{when}"] = r(vox * vox_ml, 3)
    for i, x in enumerate(sorted(out, key=lambda x: x["centre_zyx"]), start=1):
        x["name"] = f"L{i}"
    return sorted(out, key=lambda x: x["name"])


# ── Co-registration review (design-only residual offset, see module docstring) ─
def coreg(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    ref, ds = load_series(ph / "brain_flair_baseline" / "dicom")
    mov, _ = load_series(ph / "brain_flair_followup" / "dicom")
    ref, mov = ref[0], mov[0]  # (z, y, x), 1 mm isotropic
    px = float(ds[0].PixelSpacing[0])
    moved = ndimage.rotate(mov, COREG_RESIDUAL_ROT_DEG, axes=(1, 2), reshape=False, order=1)
    moved = ndimage.shift(moved, [v / px for v in COREG_RESIDUAL_SHIFT_MM], order=1)
    change = ndimage.uniform_filter(np.abs(mov - ref), 3)
    cz, cy, cx = (int(v) for v in np.unravel_index(int(np.argmax(change)), change.shape))
    fg = ref[ref > 0.2 * ref.max()]
    lo, hi = float(np.percentile(ref, 1)), float(1.6 * np.median(fg))
    hot = luts["hot"]

    def fuse(a: np.ndarray, b: np.ndarray, size: tuple[int, int], mode: str) -> np.ndarray:
        za = ndimage.zoom(a, (size[0] / a.shape[0], size[1] / a.shape[1]), order=1)
        zb = ndimage.zoom(b, (size[0] / b.shape[0], size[1] / b.shape[1]), order=1)
        g = np.repeat(window(za, lo, hi)[..., None] * 255, 3, axis=2)
        if mode == "checker":
            yy, xx = np.mgrid[0 : size[0], 0 : size[1]]
            tile = UPSAMPLE_TO // 8
            gb = np.repeat(window(zb, lo, hi)[..., None] * 255, 3, axis=2)
            return np.where((((yy // tile) + (xx // tile)) % 2 == 0)[..., None], g, gb).astype(np.uint8)
        c = hot[(window(zb, lo, hi) * 255).astype(int)].astype(float)
        return (0.5 * g + 0.5 * c).astype(np.uint8)

    nz, ny, nx = ref.shape
    full = UPSAMPLE_TO
    views = {
        # axial (y down = posterior), coronal and sagittal with superior up and true 1 mm aspect
        "ax": (ref[cz], moved[cz], (full, full)),
        "cor": (ref[::-1, cy, :], moved[::-1, cy, :], (full * nz // ny, full)),
        "sag": (ref[::-1, :, cx], moved[::-1, :, cx], (full * nz // ny, full)),
    }
    for name, (a, b, size) in views.items():
        for mode in ("checker", "blend"):
            Image.fromarray(fuse(a, b, size, mode), "RGB").save(img / f"coreg_{name}_{mode}.png")
    f = full / nx
    data["coreg"] = {
        "matrix": [nz, ny, nx],
        "pixel_mm": r(px, 2),
        "cursor_vox_zyx": [cz, cy, cx],
        "cursor_px": {"ax": [r((cx + 0.5) * f, 1), r((cy + 0.5) * f, 1)], "cor": [r((cx + 0.5) * f, 1), r((nz - cz - 0.5) * f, 1)], "sag": [r((cy + 0.5) * f, 1), r((nz - cz - 0.5) * f, 1)]},
        "residual_shift_mm_zyx": list(COREG_RESIDUAL_SHIFT_MM),
        "residual_rot_deg_z": COREG_RESIDUAL_ROT_DEG,
        "window": [r(lo, 1), r(hi, 1)],
    }


# ── Display test pattern (brief §12.3, original design) ───────────────────────
def test_pattern(img: Path, w: int = 1920, h: int = 1000) -> None:
    """Grayscale steps, low-contrast patches, resolution bars and a ramp, 8-bit, pixel exact."""
    a = np.full((h, w), 128, np.uint8)
    a[:, [0, -1]] = 255
    a[[0, -1], :] = 255
    # 18 equal grayscale steps across the top band
    sw = (w - 80) // 18
    for k in range(18):
        a[40:200, 40 + k * sw : 40 + (k + 1) * sw] = round(k * 255 / 17)
    # continuous ramp
    a[230:290, 40 : w - 40] = np.linspace(0, 255, w - 80).astype(np.uint8)[None, :]
    # low-contrast patches: 5 % inside black, 95 % inside white (plus 2 % and 98 %)
    for x0, base, patches in ((40, 0, (13, 5)), (w - 400, 255, (242, 250))):
        a[330:690, x0 : x0 + 360] = base
        a[400:500, x0 + 60 : x0 + 160] = patches[0]
        a[520:620, x0 + 200 : x0 + 300] = patches[1]
    # resolution bars: 1, 2 and 3 px line pairs, horizontal and vertical, black on white
    cx = w // 2 - 330
    for i, p in enumerate((1, 2, 3)):
        x = cx + i * 230
        blk = np.full((360, 200), 255, np.uint8)
        for j in range(0, 200, 2 * p):
            blk[:180, j : j + p] = 0
        for j in range(0, 180, 2 * p):
            blk[180 + j : 180 + j + p, :] = 0
        a[330:690, x : x + 200] = blk
    # mid-gray field with a 1 px grid for geometry
    a[730 : h - 40, 40 : w - 40] = 128
    a[730 : h - 40 : 40, 40 : w - 40] = 160
    a[730 : h - 40, 40 : w - 40 : 40] = 160
    Image.fromarray(a, "L").save(img / "test_pattern.png")


# ── Tractography (TRK-006 rules on the in-plane DTI phantom tensors) ──────────
def track(e1: np.ndarray, fa: np.ndarray, seeds: np.ndarray, px: float) -> list[np.ndarray]:
    """Deterministic streamlines (y, x in voxels): FA >= 0.20, turn <= 45 deg, length >= 10 mm, step 0.5 voxel."""
    ny, nx = fa.shape
    cos_max = np.cos(np.deg2rad(45.0))
    fibers = []
    for sy, sx in seeds:
        halves = []
        for sign in (1.0, -1.0):
            p = np.array([sy + 0.5, sx + 0.5])
            d0 = e1[int(sy), int(sx), [1, 0]]
            if np.linalg.norm(d0) < 1e-6:
                break
            prev = sign * d0 / np.linalg.norm(d0)
            pts = [p.copy()]
            for _ in range(400):
                q = p + 0.5 * prev
                iy, ix = int(q[0]), int(q[1])
                if not (0 <= iy < ny and 0 <= ix < nx) or fa[iy, ix] < 0.20:
                    break
                d = e1[iy, ix, [1, 0]]
                n = np.linalg.norm(d)
                if n < 0.5:  # principal direction mostly through-plane: no in-plane step
                    break
                d = d / n
                if np.dot(d, prev) < 0:
                    d = -d
                if np.dot(d, prev) < cos_max:
                    break
                p, prev = q, d
                pts.append(p.copy())
            halves.append(np.array(pts))
        if len(halves) == 2:
            f = np.concatenate([halves[1][::-1], halves[0][1:]])
            if (len(f) - 1) * 0.5 * px >= 10.0:
                fibers.append(f)
    return fibers


def tractography(ph: Path, img: Path, data: dict) -> None:
    c = DTI_CACHE
    e1, fa, adc, px, z_trk = c["e1"], c["fa"], c["adc_e6"], c["px"], c["z_mm"]
    ny, nx = fa.shape

    def roi_at(x_mm: float, y_mm: float) -> np.ndarray:
        yy, xx = np.mgrid[0:ny, 0:nx]
        cx, cy = (nx - 1) / 2 + x_mm / px, (ny - 1) / 2 + y_mm / px
        return ((xx - cx) / 2.5) ** 2 + ((yy - cy) / 3.5) ** 2 <= 1

    bundles = []
    for name, (x_mm, y_mm) in (("Corpus callosum", (0.0, 0.0)), ("Left posterior A–P", (24.0, 30.0))):
        roi = roi_at(x_mm, y_mm)
        fibers = track(e1, fa, np.argwhere(roi), px)
        lens = [(len(f) - 1) * 0.5 * px for f in fibers]
        vox = np.concatenate([f.astype(int) for f in fibers]) if fibers else np.zeros((0, 2), int)
        fav = fa[vox[:, 0], vox[:, 1]] if len(vox) else np.zeros(1)
        adv = adc[vox[:, 0], vox[:, 1]] if len(vox) else np.zeros(1)
        bundles.append({
            "name": name,
            "roi_voxels": int(roi.sum()),
            "roi_fa": r(fa[roi].mean(), 3),
            "roi_adc_e6": r(adc[roi].mean(), 0),
            "fibers": len(fibers),
            "mean_length_mm": r(np.mean(lens) if lens else 0, 1),
            "fa_mean": r(fav.mean(), 3), "fa_sd": r(fav.std(), 3),
            "adc_mean_e6": r(adv.mean(), 0), "adc_sd_e6": r(adv.std(), 0),
            "roi_centre_mm": [x_mm, y_mm],
            "_fibers_mm": [np.stack([(f[:, 1] - nx / 2) * px, (f[:, 0] - ny / 2) * px], 1) for f in fibers],
        })
    # seeds in the corticospinal tract run through-plane: no in-plane fibers, as the UI reports
    si_seeds = roi_at(28.0, 1.0) & (c["labels"] == 5)  # left corticospinal tract voxels (S–I fibre class)
    si_fibers = len(track(e1, fa, np.argwhere(si_seeds), px))

    # Anatomy: 3D FLAIR baseline (1.5 mm isotropic); the axial plane is the DTI tracking slice
    fl, fds = load_series(ph / "brain_flair_baseline" / "dicom")
    ftruth = np.load(ph / "brain_flair_baseline" / "truth.npz")
    fl = fl[0]
    fz, fy, fx = fl.shape
    fpx = float(fds[0].PixelSpacing[0])
    zi = int(np.argmin(np.abs(ftruth["slice_z_mm"] - z_trk)))
    fg = fl[fl > 0.2 * fl.max()]
    glo, ghi = float(np.percentile(fl, 1)), float(1.6 * np.median(fg))
    gray = lambda a: np.repeat(window(a, glo, ghi)[..., None] * 255, 3, axis=-1)  # noqa: E731
    dir_rgb = np.abs(e1) * fa[..., None] * 255
    half = 84.0  # mm, half extent of the drawn planes (the head, not the whole field of view)
    halfz = fz * fpx / 2.0
    zc_mm = (zi - (fz - 1) / 2) * fpx  # height of the axial plane in the volume [mm]
    SAG_X = 6.0  # paramedian sagittal plane (the midline is the interhemispheric fissure)
    sag_i = int(round((fx - 1) / 2 + SAG_X / fpx))

    def fidx(v: np.ndarray, n: int) -> np.ndarray:
        return np.clip(((v + n * fpx / 2) / fpx).astype(int), 0, n - 1)

    def axial_rgb(xm: np.ndarray, ym: np.ndarray) -> np.ndarray:
        """FLAIR at the tracking slice plus the FA-direction overlay where FA >= 0.2."""
        a = fl[zi][fidx(ym, fy), fidx(xm, fx)]
        g = gray(a)
        dx = np.clip((xm / px + nx / 2).astype(int), 0, nx - 1)
        dy = np.clip((ym / px + ny / 2).astype(int), 0, ny - 1)
        alpha = (np.clip((fa[dy, dx] - 0.2) / 0.3, 0, 1) * 0.65 * (a > 0.2 * fl.max()))[..., None]
        return (1 - alpha) * g + alpha * dir_rgb[dy, dx]

    # 3D view: orthographic, z-buffered point splatting of the three planes and the fibers.
    # 3D coordinates [mm]: x, y as in the image, z up, origin on the axial plane.
    az, el = np.deg2rad(-58.0), np.deg2rad(32.0)
    cam = np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)])
    right = np.array([-np.sin(az), np.cos(az), 0.0])
    upv = np.cross(cam, right)
    size, scale = 1024, 4.6
    canvas = np.zeros((size, size, 3))
    depth = np.full((size, size), -np.inf)

    def splat(p: np.ndarray, rgb: np.ndarray, rad: int = 0) -> None:
        sx = np.round(size / 2 + scale * (p @ right)).astype(int)
        sy = np.round(size / 2 - scale * (p @ upv)).astype(int)
        dz = p @ cam
        for oy in range(-rad, rad + 1):
            for ox in range(-rad, rad + 1):
                X, Y = sx + ox, sy + oy
                ok = (X >= 0) & (X < size) & (Y >= 0) & (Y < size)
                Xo, Yo, Do, Co = X[ok], Y[ok], dz[ok], rgb[ok]
                order = np.argsort(Do)
                Xo, Yo, Do, Co = Xo[order], Yo[order], Do[order], Co[order]
                closer = Do > depth[Yo, Xo]
                depth[Yo[closer], Xo[closer]] = Do[closer]
                canvas[Yo[closer], Xo[closer]] = Co[closer]

    step = 0.5
    g1 = np.arange(-half, half, step)
    gz = np.arange(-halfz, halfz, step)
    X, Y = np.meshgrid(g1, g1)
    splat(np.stack([X.ravel(), Y.ravel(), np.zeros(X.size)], 1), axial_rgb(X, Y).reshape(-1, 3), 1)
    Xc, Zc = np.meshgrid(g1, gz)
    zrow = fidx(Zc, fz)
    cor = gray(fl[zrow, fy // 2, fidx(Xc, fx)])
    splat(np.stack([Xc.ravel(), np.zeros(Xc.size), (Zc - zc_mm).ravel()], 1), cor.reshape(-1, 3), 1)
    Ys, Zs = np.meshgrid(g1, gz)
    sag = gray(fl[fidx(Zs, fz), fidx(Ys, fy), sag_i])
    splat(np.stack([np.full(Ys.size, SAG_X), Ys.ravel(), (Zs - zc_mm).ravel()], 1), sag.reshape(-1, 3), 1)
    t = np.arange(-half, half, 0.12)
    tz = np.arange(-halfz, halfz, 0.12) - zc_mm
    zlo, zhi = -halfz - zc_mm, halfz - zc_mm
    lines = {
        "axial": [np.stack([t, np.full_like(t, s), np.zeros_like(t)], 1) for s in (-half, half)] + [np.stack([np.full_like(t, s), t, np.zeros_like(t)], 1) for s in (-half, half)],
        "coronal": [np.stack([t, np.zeros_like(t), np.full_like(t, s)], 1) for s in (zlo, zhi)] + [np.stack([np.full_like(tz, s), np.zeros_like(tz), tz], 1) for s in (-half, half)],
        "sagittal": [np.stack([np.full_like(t, SAG_X), t, np.full_like(t, s)], 1) for s in (zlo, zhi)] + [np.stack([np.full_like(tz, SAG_X), np.full_like(tz, s), tz], 1) for s in (-half, half)],
    }
    for k, segs in lines.items():
        for sgm in segs:
            splat(sgm + cam * 0.2, np.tile(PALETTE[f"plane-{k}"], (len(sgm), 1)), 1)
    head = fl[zi] > 0.2 * fl.max()

    def keep(f: np.ndarray) -> np.ndarray:
        return (np.abs(f[:, 0]) < half) & (np.abs(f[:, 1]) < half) & head[fidx(f[:, 1], fy), fidx(f[:, 0], fx)]

    for b, colour in zip(bundles, ROI_RGB, strict=False):
        for f in b["_fibers_mm"]:
            f = f[keep(f)]
            if len(f) < 2:
                continue
            seg = np.concatenate([np.linspace(f[i], f[i + 1], 6) for i in range(len(f) - 1)])
            pts = np.column_stack([seg, np.full(len(seg), 1.0)])
            splat(pts, np.tile(colour, (len(pts), 1)), 1)
    Image.fromarray(canvas.astype(np.uint8), "RGB").resize((768, 768), Image.LANCZOS).save(img / "trk_3d.png")

    half = fx * fpx / 2.0  # reference views show the whole field of view
    ref = (np.arange(UPSAMPLE_TO) + 0.5) / UPSAMPLE_TO * 2 * half - half
    RX, RY = np.meshgrid(ref, ref)
    from PIL import ImageDraw
    pil = Image.fromarray(axial_rgb(RX, RY).astype(np.uint8), "RGB")
    dr = ImageDraw.Draw(pil)
    to_px = lambda v: (v + half) / (2 * half) * UPSAMPLE_TO  # noqa: E731
    for b, colour in zip(bundles, ROI_RGB, strict=False):
        for f in b["_fibers_mm"]:
            f = f[keep(f)]
            if len(f) >= 2:
                dr.line([(float(to_px(x)), float(to_px(y))) for x, y in f], fill=tuple(int(v) for v in colour), width=2)
    pil.save(img / "trk_ref_ax.png")
    h2 = UPSAMPLE_TO * fz // fx
    cor_img = gray(ndimage.zoom(fl[::-1, fy // 2, :], (h2 / fz, UPSAMPLE_TO / fx), order=1))
    sag_img = gray(ndimage.zoom(fl[::-1, :, sag_i], (h2 / fz, UPSAMPLE_TO / fy), order=1))
    Image.fromarray(cor_img.astype(np.uint8), "RGB").save(img / "trk_ref_cor.png")
    Image.fromarray(sag_img.astype(np.uint8), "RGB").save(img / "trk_ref_sag.png")
    mrs_z = int(np.argmin(np.abs(ftruth["slice_z_mm"] - 30.0)))  # centrum semiovale, the SVS level
    Image.fromarray(gray(ndimage.zoom(fl[mrs_z], UPSAMPLE_TO / fx, order=1)).astype(np.uint8), "RGB").save(img / "mrs_ref_ax.png")
    for b in bundles:
        b.pop("_fibers_mm")
    data["trk"] = {"bundles": bundles, "si_band_fibers": si_fibers, "si_seed_voxels": int(si_seeds.sum()), "fov_mm": r(2 * half, 1), "flair_window": [r(glo, 1), r(ghi, 1)],
                   "slice_z_mm": r(z_trk, 1), "plane_z_px": r((fz - 1 - zi + 0.5) / fz * h2, 1), "sag_x_mm": SAG_X}


# ── Spectroscopy ──────────────────────────────────────────────────────────────
def mrs(ph: Path, data: dict) -> None:
    d = np.load(ph / "mrs_svs" / "fid.npz")
    fid = d["fid"]
    bw, f0, ref = float(d["bw_hz"]), float(d["f0_mhz"]), float(d["ref_ppm"])
    n = len(fid)
    spec = np.fft.fftshift(np.fft.fft(fid * np.exp(-np.arange(n) / n * 2)))
    freq = np.fft.fftshift(np.fft.fftfreq(n, 1 / bw))
    ppm = ref + freq / f0
    # automatic zero-order phase: maximise the real integral
    phis = np.linspace(-np.pi, np.pi, 361)
    best = phis[np.argmax([np.real(spec * np.exp(1j * p)).sum() for p in phis])]
    real = np.real(spec * np.exp(1j * best))
    sel = (ppm > 0.2) & (ppm < 4.2)
    pp, rr = ppm[sel], real[sel]
    order = np.argsort(pp)[::-1]
    pp, rr = pp[order], rr[order]
    step = max(1, len(pp) // 700)
    base = ndimage.minimum_filter1d(rr, 80)
    base = ndimage.uniform_filter1d(base, 120)
    noise_region = real[(ppm > 8.5) & (ppm < 9.5)] if ((ppm > 8.5) & (ppm < 9.5)).any() else real[:50]
    truth = np.load(ph / "mrs_svs" / "truth.npz")
    peaks = {"NAA": 2.01, "Cr": 3.03, "Cho": 3.20, "mI": 3.56, "Cr2": 3.92}
    rows = []
    for name, pos in peaks.items():
        w = (pp > pos - 0.05) & (pp < pos + 0.05)
        h = float((rr - base)[w].max()) if w.any() else 0.0
        area = float(np.trapezoid((rr - base)[w], -pp[w])) if w.any() else 0.0
        rows.append({"metabolite": name, "ppm": pos, "height": r(h, 1), "area": r(area, 2)})
    cr_area = next(x["area"] for x in rows if x["metabolite"] == "Cr") or 1.0
    for x in rows:
        x["ratio_cr"] = r(x["area"] / cr_area, 2)
    rms = float(np.sqrt(np.mean((noise_region - noise_region.mean()) ** 2))) or 1.0
    data["mrs"] = {
        "ppm": [r(v, 3) for v in pp[::step]],
        "real": [r(v, 2) for v in rr[::step]],
        "baseline": [r(v, 2) for v in base[::step]],
        "phase0_deg": r(np.degrees(best), 1),
        "f0_mhz": r(f0, 3),
        "bw_hz": r(bw, 0),
        "points": n,
        "linewidth_hz": r(float(d["fwhm_hz"]), 1),
        "linewidth_ppm": r(float(d["fwhm_hz"]) / f0, 3),
        "snr": r(max(x["height"] for x in rows if x["metabolite"] in ("NAA", "Cr", "Cho")) / rms, 1),
        "table": rows,
        "truth_amplitudes": {k: r(float(truth[k]), 3) for k in truth.files},
    }


def write_luts_css(out: Path, luts: dict[str, list[str]], roi: list[str], mm: dict[str, str]) -> None:
    lines = [
        "/* Data colours for the design screens, generated from packages/viewer/src/luts/index.ts.",
        " * Data only (LUT bars, ROI outlines and curves, mismatch overlays); chrome uses tokens.css. */",
        ":root {",
    ]
    for name, pts in luts.items():
        stops = ", ".join(pts)
        lines.append(f"  --nm-lut-{name}: linear-gradient(to top, {stops});")
        lines.append(f"  --nm-lut-{name}-h: linear-gradient(to right, {stops});")
    for i, c in enumerate(roi, start=1):
        lines.append(f"  --nm-roi-{i}: {c};")
    for k, c in mm.items():
        lines.append(f"  --nm-{k}: {c};" if k.startswith(("dir-", "plane-")) else f"  --nm-mismatch-{k}: {c};")
    lines.append("}")
    (out / "luts.css").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phantoms", type=Path, default=ROOT / "data" / "phantoms")
    ap.add_argument("--out", type=Path, default=ROOT / "design" / "assets")
    a = ap.parse_args()
    img, dat = a.out / "img", a.out / "data"
    img.mkdir(parents=True, exist_ok=True)
    dat.mkdir(parents=True, exist_ok=True)
    lut_pts, roi, mm = load_luts()
    luts = {k: build_lut(v) for k, v in lut_pts.items()}
    PALETTE.update({k: hexrgb(v) for k, v in mm.items()})
    ROI_RGB.extend(hexrgb(c) for c in roi)
    data: dict = {}
    dsc(a.phantoms, img, data, luts)
    dti(a.phantoms, img, data, luts, mm)
    ivim(a.phantoms, img, data, luts)
    dce(a.phantoms, img, data, luts)
    fmri(a.phantoms, img, data, luts)
    flair(a.phantoms, img, data, luts)
    echo(a.phantoms, img, data)
    flair_star(a.phantoms, img, data)
    coreg(a.phantoms, img, data, luts)
    tractography(a.phantoms, img, data)
    test_pattern(img)
    mrs(a.phantoms, data)
    (dat / "_deficit.npy").unlink(missing_ok=True)
    (dat / "_deficit_px.npy").unlink(missing_ok=True)
    (dat / "phantom-data.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    write_luts_css(a.out, lut_pts, roi, mm)
    print(f"wrote {len(list(img.glob('*.png')))} images and phantom-data.json to {a.out}")


if __name__ == "__main__":
    main()
