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

Design-only lesion: the Phase 0 DSC and DTI phantoms have no delayed or restricted
region, so a faithful Tmax map is flat and the mismatch volume is zero. To show the
DSC and Mismatch screens in their working state, this renderer adds one synthetic
right-hemisphere lesion to the loaded phantom arrays (never to the files on disk):
DSC curves inside a 22 mm disc get ΔR2* × 0.5 and a 4-dynamic bolus delay; DTI
signal inside an 11 mm disc at the same centre gets ADC × 0.45. The validated stroke
phantom arrives with the Mismatch package (Phase 3).

Design-only misalignment: the only 3D volumes in Phase 0 are the FLAIR baseline and
follow-up (64 × 64 × 32, 1 mm). The co-registration screen fuses the follow-up (input)
onto the baseline (reference) after applying a known residual rigid offset
(COREG_RESIDUAL_*) so that the review state has something to correct.
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

LESION_CENTRE_MM = (-30.0, 0.0)  # (x, y) from image centre; patient right
DEFICIT_RADIUS_MM = 22.0
CORE_RADIUS_MM = 11.0
LESION_DELAY_DYN = 4
LESION_DR2_SCALE = 0.5
CORE_ADC_SCALE = 0.45
COREG_RESIDUAL_SHIFT_MM = (0.0, -1.5, 2.5)  # (z, y, x)
COREG_RESIDUAL_ROT_DEG = 2.0  # about the z axis


def disc(shape: tuple[int, int], pixel_mm: float, radius_mm: float) -> np.ndarray:
    ny, nx = shape
    yy, xx = np.mgrid[0:ny, 0:nx]
    x = (xx - (nx - 1) / 2) * pixel_mm
    y = (yy - (ny - 1) / 2) * pixel_mm
    return (x - LESION_CENTRE_MM[0]) ** 2 + (y - LESION_CENTRE_MM[1]) ** 2 <= radius_mm**2



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


def hexrgb(h: str) -> np.ndarray:
    return np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)], float)


def seed_px(mask: np.ndarray) -> list[float]:
    """Centroid of a voxel mask in 512-px image coordinates (x, y)."""
    if not mask.any():
        return [0.0, 0.0]
    cy, cx = ndimage.center_of_mass(mask)
    f = UPSAMPLE_TO / mask.shape[0]
    return [r((cx + 0.5) * f, 1), r((cy + 0.5) * f, 1)]


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


def dsc(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "dsc_snr50_tr2.1" / "dicom")
    te = float(ds[0].EchoTime) / 1000.0
    nz, ny, nx = arr.shape[1:]
    px = float(ds[0].PixelSpacing[0])
    times = np.array([float(d.TriggerTime) / 1000.0 for d in ds[::nz]])
    n, dt = len(times), float(times[1] - times[0])
    s0 = arr[:5].mean(0)
    mask = s0 > 0.25 * s0.max()
    # design-only lesion (see module docstring)
    lesion = disc((ny, nx), px, DEFICIT_RADIUS_MM)
    for zz in range(nz):
        les = lesion & mask[zz]
        sig = arr[:, zz][:, les]
        base = s0[zz][les]
        sig = base * np.power(np.clip(sig / base, 1e-6, None), LESION_DR2_SCALE)
        sig = np.concatenate([np.repeat(sig[:1], LESION_DELAY_DYN, 0), sig[:-LESION_DELAY_DYN]], 0)
        arr[:, zz][:, les] = sig
    with np.errstate(divide="ignore", invalid="ignore"):
        dr2 = np.where(mask, -np.log(np.clip(arr, 1e-6, None) / np.clip(s0, 1e-6, None)) / te, 0.0)
    dr2 = dr2 - dr2[:5].mean(0)
    z = nz // 2
    m = mask[z]
    # voxel maps: 3×3 display smoothing of the curves, then the same moments
    sm = ndimage.uniform_filter(dr2[:, z], size=(1, 3, 3))
    area = np.zeros((ny, nx))
    mtt = np.zeros((ny, nx))
    t0 = np.zeros((ny, nx))
    ttp = np.zeros((ny, nx))
    for iy, ix in zip(*np.nonzero(m), strict=True):
        p = dsc_params(sm[:, iy, ix], times)
        area[iy, ix], mtt[iy, ix], t0[iy, ix], ttp[iy, ix] = p["area"], p["mtt"], p["t0"], p["ttp"]
    # block-circulant SVD deconvolution with the phantom's AIF (Tmax preview)
    truth = np.load(ph / "dsc_snr50_tr2.1" / "truth.npz")
    aif = truth["aif_dr2"]
    npad = 2 * n
    a = np.concatenate([aif, np.zeros(npad - n)])
    circ = np.array([np.roll(a, k) for k in range(npad)]).T * dt
    u, sv, vt = np.linalg.svd(circ)
    inv = (vt.T * np.where(sv > 0.2 * sv.max(), 1 / sv, 0)) @ u.T

    def residue(curves: np.ndarray) -> np.ndarray:
        return inv @ np.concatenate([curves, np.zeros((npad - n, curves.shape[1]))])

    sm5 = ndimage.uniform_filter(dr2[:, z], size=(1, 5, 5))
    res = residue(sm5.reshape(n, -1))
    tmax = np.where(m, (np.argmax(res[:n], 0) * dt).reshape(ny, nx), 0)
    cbf_raw = res[:n].max(0).reshape(ny, nx)
    # scale to the phantom's absolute truth using the healthy-tissue median (display units)
    healthy = m & ~lesion
    cbv_scale = np.median(truth["cbv"]) / np.median(area[healthy])
    cbf_scale = np.median(truth["cbf"]) / np.median(cbf_raw[healthy])
    rel_cbv = np.where(m, area * cbv_scale, 0)
    rel_cbf = np.where(m, cbf_raw * cbf_scale, 0)

    windows: dict[str, list[float]] = {}
    glo, ghi = save_gray(img / "dsc_source_dyn01.png", arr[0, z])
    pk_dyn = int(np.argmax(dr2[:, z][:, m].mean(1)))
    save_gray(img / "dsc_source_peak.png", arr[pk_dyn, z], glo, ghi)
    windows["source"] = [r(glo, 1), r(ghi, 1)]
    for name, mp, lo, hi, lut in (
        ("relcbv", rel_cbv, 0.0, 12.0, "stroke"),
        ("relcbf", rel_cbf, 0.0, 80.0, "stroke"),
        ("mtt", mtt, 0.0, 14.0, "blueToRed"),
        ("ttp", ttp, 10.0, 40.0, "blueToRed"),
        ("tmax", tmax, 0.0, 12.0, "stroke"),
        ("t0", t0, 5.0, 25.0, "blueToRed"),
    ):
        save_map(img / f"dsc_{name}.png", mp, m, luts[lut], lo, hi)
        save_map(img / f"dsc_{name}_overlay.png", mp, m, luts[lut], lo, hi, alpha=True)
        windows[name] = [r(lo, 2), r(hi, 2)]
    save_gray(img / "dsc_relcbv_gray.png", rel_cbv, 0, 12)

    # ROIs in voxel boxes: ROI1 inside the lesion, its mirror, ROI2 healthy
    cxl = int(round((nx - 1) / 2 + LESION_CENTRE_MM[0] / px))
    cy = int(round((ny - 1) / 2 + LESION_CENTRE_MM[1] / px))
    boxes = {
        "roi1": [cy - 5, cy + 5, cxl - 4, cxl + 4],
        "roi1_mirror": [cy - 5, cy + 5, nx - 1 - (cxl + 4), nx - 1 - (cxl - 4)],
        "roi2": [cy - 20, cy - 14, (nx - 1) // 2 - 4, (nx - 1) // 2 + 4],
    }

    def roi_curve(b: list[int]) -> np.ndarray:
        return dr2[:, z, b[0] : b[1], b[2] : b[3]].mean((1, 2))

    table = {}
    curves = {"times_s": [r(t, 2) for t in times], "aif_truth": [r(v, 3) for v in aif]}
    for key, b in boxes.items():
        c = roi_curve(b)
        p = dsc_params(c, times)
        rr = residue(c[:, None])[:n, 0]
        table[key] = {
            "relCBV": r(p["area"] * cbv_scale, 2),
            "relCBF": r(rr.max() * cbf_scale, 1),
            "MTT": r(p["mtt"], 2),
            "TTP": r(p["ttp"], 1),
            "T0": r(p["t0"], 1),
            "Tmax": r(np.argmax(rr) * dt, 1),
            "voxels": int((b[1] - b[0]) * (b[3] - b[2])),
        }
        curves[key] = [r(v, 3) for v in c]
    curves["signal_roi1"] = [r(v, 1) for v in arr[:, z, boxes["roi1"][0] : boxes["roi1"][1], boxes["roi1"][2] : boxes["roi1"][3]].mean((1, 2))]
    # 7×7 AIF box: brightest early-peaking healthy region of the mid slice
    pk = np.where(healthy, dr2[:, z].max(0), 0)
    by, bx = np.unravel_index(np.argmax(ndimage.uniform_filter(pk, 7)), pk.shape)
    by, bx = int(np.clip(by, 3, ny - 4)), int(np.clip(bx, 3, nx - 4))
    box = dr2[:, z, by - 3 : by + 4, bx - 3 : bx + 4]
    selected = sorted(int(i) for i in np.argsort(box.max(0).ravel())[-6:])
    data["dsc"] = {
        "slice": z + 1,
        "slices": nz,
        "dynamics": n,
        "tr_s": r(dt, 2),
        "te_ms": r(te * 1000, 1),
        "pixel_mm": r(px, 2),
        "matrix": [ny, nx],
        "peak_dynamic": pk_dyn + 1,
        "windows": windows,
        "curves": curves,
        "table": table,
        "roi_boxes_vox": boxes,
        "aif_box": {
            "center_yx": [by, bx],
            "curves": [[r(v, 2) for v in box[:, i // 7, i % 7]] for i in range(49)],
            "selected": selected,
            "average": [r(v, 3) for v in box.reshape(n, 49)[:, selected].mean(1)],
        },
        "lesion": {"centre_mm": list(LESION_CENTRE_MM), "deficit_radius_mm": DEFICIT_RADIUS_MM, "core_radius_mm": CORE_RADIUS_MM},
    }
    deficit = ndimage.binary_opening((tmax > 6.0) & m, iterations=2)
    lab, nlab = ndimage.label(deficit)
    if nlab:
        deficit = lab == (1 + int(np.argmax(ndimage.sum(deficit, lab, range(1, nlab + 1)))))
    np.save(img.parent / "data" / "_deficit.npy", deficit)
    np.save(img.parent / "data" / "_deficit_px.npy", np.array([px]))
    save_overlay_on_gray(img / "dsc_tmax_on_source.png", arr[0, z], glo, ghi, tmax, deficit, luts["stroke"], 0, 12, 0.7)
    # Mismatch perfusion viewer: Tmax map with the segmented deficit (light fill + outline)
    tmax_rgb = np.repeat(window(up(tmax), 0, 12)[..., None] * 255, 3, axis=2)
    Image.fromarray(segmentation_overlay(tmax_rgb, deficit, PALETTE["deficit"], 0.35), "RGB").save(img / "mismatch_deficit_on_tmax.png")
    mir = deficit[:, ::-1] & ~deficit & m
    data["dsc"]["mismatch"] = {
        "deficit_seed_px": seed_px(deficit),
        "deficit_voxels_slice": int(deficit.sum()),
        "signal_deficit": [r(v, 1) for v in arr[:, z][:, deficit].mean(1)],
        "signal_contra": [r(v, 1) for v in arr[:, z][:, mir].mean(1)],
    }


# ── DTI / diffusion ───────────────────────────────────────────────────────────
def dti(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray], mm: dict[str, str]) -> None:
    arr, ds = load_series(ph / "dti_32dir_snr30.0" / "dicom")
    nz = arr.shape[1]
    hdr = ds[::nz]
    bvals = np.array([float(d.DiffusionBValue) for d in hdr])
    bvecs = np.array([[float(v) for v in d.DiffusionGradientOrientation] if "DiffusionGradientOrientation" in d else [0, 0, 0] for d in hdr])
    z = nz // 2
    s = np.clip(arr[:, z], 1e-3, None)
    b0 = s[bvals == 0].mean(0)
    mask = b0 > 0.25 * b0.max()
    px = float(ds[0].PixelSpacing[0])
    core_disc = disc(b0.shape, px, CORE_RADIUS_MM) & mask  # design-only core (module docstring)
    s[:, core_disc] = b0[core_disc] * np.power(np.clip(s[:, core_disc] / b0[core_disc], 1e-6, None), CORE_ADC_SCALE)
    g = bvecs
    design = np.column_stack([np.ones(len(bvals)), -bvals * g[:, 0] ** 2, -bvals * g[:, 1] ** 2, -bvals * g[:, 2] ** 2,
                              -2 * bvals * g[:, 0] * g[:, 1], -2 * bvals * g[:, 0] * g[:, 2], -2 * bvals * g[:, 1] * g[:, 2]])
    y = np.log(s.reshape(len(bvals), -1))
    coef, *_ = np.linalg.lstsq(design, y, rcond=None)
    dxx, dyy, dzz, dxy, dxz, dyz = coef[1:]
    tens = np.stack([np.stack([dxx, dxy, dxz], -1), np.stack([dxy, dyy, dyz], -1), np.stack([dxz, dyz, dzz], -1)], -2)
    ev, evec = np.linalg.eigh(tens)
    ev = np.clip(ev[:, ::-1], 0, None)
    e1 = evec[:, :, -1]
    md = ev.mean(1)
    with np.errstate(divide="ignore", invalid="ignore"):
        fa = np.sqrt(1.5 * ((ev - md[:, None]) ** 2).sum(1) / np.maximum((ev**2).sum(1), 1e-20))
        ra = np.sqrt(((ev - md[:, None]) ** 2).sum(1) / 3) / np.maximum(md, 1e-20)
    shp = b0.shape
    fa, md, ra = fa.reshape(shp) * mask, md.reshape(shp) * mask, ra.reshape(shp) * mask
    ad, rd = ev[:, 0].reshape(shp) * mask, ev[:, 1:].mean(1).reshape(shp) * mask
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
    col = np.abs(e1.reshape(*shp, 3)) * fa[..., None]
    Image.fromarray((np.clip(up(col, 0), 0, 1) * 255).astype(np.uint8), "RGB").save(img / "dti_fa_direction.png")
    # Mismatch core: ADC < 620e-6 mm²/s inside brain; paired with DSC deficit
    core = (adc_e6 < 620) & mask
    d_src = np.load(img.parent / "data" / "_deficit.npy")
    d_px = float(np.load(img.parent / "data" / "_deficit_px.npy")[0])
    yy, xx = np.mgrid[0 : core.shape[0], 0 : core.shape[1]]
    sy = np.round((yy - (core.shape[0] - 1) / 2) * px / d_px + (d_src.shape[0] - 1) / 2).astype(int)
    sx = np.round((xx - (core.shape[1] - 1) / 2) * px / d_px + (d_src.shape[1] - 1) / 2).astype(int)
    inside = (sy >= 0) & (sy < d_src.shape[0]) & (sx >= 0) & (sx < d_src.shape[1])
    deficit = np.zeros_like(core)
    deficit[inside] = d_src[sy[inside], sx[inside]]
    deficit &= mask
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
    # Mismatch diffusion viewer: ADC map with the segmented core (light fill + outline)
    adc_rgb = np.repeat(window(up(adc_e6), 0, 3000)[..., None] * 255, 3, axis=2)
    Image.fromarray(segmentation_overlay(adc_rgb, core, PALETTE["core"], 0.35), "RGB").save(img / "mismatch_core_on_adc.png")
    vox_ml = float(ds[0].PixelSpacing[0]) ** 2 * float(ds[0].SliceThickness) / 1000.0
    perf_ml, diff_ml = float(deficit.sum()) * vox_ml * nz, float(core.sum()) * vox_ml * nz
    truth = np.load(ph / "dti_32dir_snr30.0" / "truth.npz")
    data["dti"] = {
        "bvals": sorted({int(b) for b in bvals}),
        "directions": int((bvals > 0).sum()),
        "slices": nz,
        "slice": z + 1,
        "matrix": [int(ds[0].Rows), int(ds[0].Columns)],
        "pixel_mm": r(float(ds[0].PixelSpacing[0]), 2),
        "fa_classes_truth": [r(v, 3) for v in truth["fa"]],
        "fa_classes_measured": [r(fa[truth["labels"][z] == k].mean(), 3) for k in range(len(truth["fa"]))],
        "adc_classes_e6": [r(adc_e6[truth["labels"][z] == k].mean(), 0) for k in range(len(truth["fa"]))],
        "adc_window_e6": [0, 3000],
        "b0_window": [r(glo, 1), r(ghi, 1)],
        "mismatch": {
            "perfusion_ml": r(perf_ml, 1),
            "diffusion_ml": r(diff_ml, 1),
            "mismatch_ml": r(perf_ml - diff_ml, 1),
            "ratio_pct": r(100 * (perf_ml - diff_ml) / max(perf_ml, 1e-9), 1),
            "core_mean_adc_e6": r(adc_e6[core].mean() if core.any() else 0, 0),
            "core_seed_px": seed_px(core),
            "core_voxels_slice": int(core.sum()),
            "deficit_voxels_slice": int(deficit.sum()),
            "penumbra_mean_adc_e6": r(adc_e6[deficit & ~core].mean() if (deficit & ~core).any() else 0, 0),
        },
    }


# ── Advanced diffusion (IVIM / DKI) ───────────────────────────────────────────
def ivim(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "ivim_dki" / "dicom")
    nz = arr.shape[1]
    bvals = np.array([float(d.DiffusionBValue) for d in ds[::nz]])
    z = nz // 2
    s = np.clip(arr[:, z], 1e-3, None)
    mask = s[0] > 0.25 * s[0].max()
    hi = (bvals >= 200) & (bvals <= 1000)
    p = np.polyfit(bvals[hi], np.log(s[hi].reshape(hi.sum(), -1)), 1)
    d = np.clip(-p[0], 0, None).reshape(s.shape[1:]) * mask
    f = np.clip(1 - np.exp(p[1]).reshape(s.shape[1:]) / s[0], 0, 1) * mask
    save_gray(img / "ivim_b0.png", s[0])
    save_map(img / "ivim_d.png", d * 1e6, mask, luts["blueToRed"], 0, 3000)
    save_map(img / "ivim_f.png", f * 100, mask, luts["blueToRed"], 0, 30)
    truth = np.load(ph / "ivim_dki" / "truth.npz")
    save_map(img / "ivim_dstar.png", np.where(mask, truth["dstar"][np.clip(truth["labels"][z], 0, None)] * 1e3, 0), mask, luts["blueToRed"], 0, 50)
    save_map(img / "ivim_k.png", np.where(mask, truth["k"][np.clip(truth["labels"][z], 0, None)], 0), mask, luts["blueToRed"], 0, 2)
    # cDWI at b = 1400 from the mono-exponential fit
    s0 = np.exp(p[1]).reshape(s.shape[1:])
    save_gray(img / "ivim_cdwi_b1400.png", s0 * np.exp(-1400 * d) * mask)
    roi = (slice(16, 24), slice(8, 14))
    data["ivim"] = {
        "bvals": [int(b) for b in bvals],
        "signal_roi1": [r(v, 1) for v in s[:, roi[0], roi[1]].mean((1, 2))],
        "fit": {"D_e6": r(d[roi].mean() * 1e6, 0), "f_pct": r(f[roi].mean() * 100, 1)},
        "truth": {k: [r(v, 5) for v in truth[k]] for k in ("d", "f", "dstar", "k")},
    }


# ── DCE semi-quantitative and Tofts ───────────────────────────────────────────
def dce(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "dce_semiquant" / "dicom")
    nz = arr.shape[1]
    times = np.array([float(d.TriggerTime) / 1000.0 for d in ds[::nz]])
    z = 0
    s = arr[:, z]
    mask = s[0] > 0.2 * s[0].max()
    with np.errstate(divide="ignore", invalid="ignore"):
        relenh = np.where(mask, (s / np.maximum(s[0], 1e-6) - 1) * 100, 0)
    maxrel = relenh.max(0)
    glo, ghi = save_gray(img / "dce_source.png", s[int(np.argmax(relenh.mean((1, 2))))])
    save_gray(img / "dce_subtracted.png", (s[int(np.argmax(relenh.mean((1, 2))))] - s[0]) * mask)
    save_map(img / "dce_maxrelenh.png", maxrel, mask, luts["blueToRed"], 0, float(np.percentile(maxrel[mask], 99)))
    save_map(img / "dce_ttp.png", times[np.argmax(s, 0)], mask, luts["blueToRed"], float(times.min()), float(times.max()))
    truth = np.load(ph / "dce_semiquant" / "truth.npz")
    lab = truth["labels"][z]
    data["dce"] = {
        "times_s": [r(t, 1) for t in times],
        "dynamics": len(times),
        "curves": {f"class{k}": [r(v, 1) for v in s[:, lab == k].mean(1)] for k in range(len(truth["s0"]))},
        "maxrelenh_window": [0, r(np.percentile(maxrel[mask], 99), 0)],
        "truth": {k: [r(v, 3) for v in truth[k]] for k in ("s0", "s1", "t0", "t1", "washin", "washout", "maxenh", "maxrelenh")},
    }
    # Tofts: maps from the phantom's ground-truth parameters per tissue class
    arr2, ds2 = load_series(ph / "dce_tofts" / "dicom_dce")
    nz2 = arr2.shape[1]
    t2 = np.array([float(d.TriggerTime) / 1000.0 for d in ds2[::nz2]])
    tr = np.load(ph / "dce_tofts" / "truth.npz")
    lab2 = tr["labels"][0]
    m2 = lab2 >= 0
    save_gray(img / "perm_source.png", arr2[-1, 0])
    for key, lo, hi_ in (("ktrans", 0, 0.3), ("kep", 0, 1.5), ("ve", 0, 0.6), ("vp", 0, 0.1)):
        vals = tr[key][np.clip(lab2, 0, None)]
        save_map(img / f"perm_{key}.png", np.where(m2, vals, 0), m2, luts["stroke"], lo, hi_)
    vfa5, _ = load_series(ph / "dce_tofts" / "dicom_vfa5")
    vfa15, _ = load_series(ph / "dce_tofts" / "dicom_vfa15")
    save_gray(img / "perm_vfa5.png", vfa5[0, 0])
    save_gray(img / "perm_vfa15.png", vfa15[0, 0])
    save_map(img / "perm_t1.png", np.where(m2, tr["t1"][np.clip(lab2, 0, None)], 0), m2, luts["blueToRed"], 500, 2500)
    data["perm"] = {
        "times_s": [r(t, 1) for t in t2],
        "dynamics": len(t2),
        "tr_ms": r(float(ds2[0].RepetitionTime), 1),
        "te_ms": r(float(ds2[0].EchoTime), 1),
        "flip_deg": r(float(ds2[0].FlipAngle), 0),
        "aif_cp": [r(v, 3) for v in tr["aif_cp"]],
        "tissue_curve_class2": [r(v, 1) for v in arr2[:, 0][:, lab2 == 2].mean(1)],
        "truth": {k: [r(v, 4) for v in tr[k]] for k in ("ktrans", "kep", "ve", "vp", "t1")},
    }


# ── fMRI ──────────────────────────────────────────────────────────────────────
def fmri(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    arr, ds = load_series(ph / "fmri_block" / "dicom")
    nz = arr.shape[1]
    n = arr.shape[0]
    tr = float(ds[0].RepetitionTime) / 1000.0
    t = np.arange(n) * tr
    truth = np.load(ph / "fmri_block" / "truth.npz")
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
    slices = []
    for zz in range(nz):
        glo, ghi = save_gray(img / f"fmri_epi_z{zz + 1}.png", mean[zz])
        save_overlay_on_gray(img / f"fmri_t_z{zz + 1}.png", mean[zz], glo, ghi, tmap[zz], tmap[zz] > 3.1, luts["hot"], 3.1, 12, 0.8)
        slices.append(zz + 1)
    act = truth["active"]
    cl = act.any(0)
    data["fmri"] = {
        "dynamics": n,
        "tr_s": r(tr, 2),
        "slices": nz,
        "onsets_s": [r(v, 1) for v in truth["onsets"]],
        "durations_s": [r(v, 1) for v in truth["durations"]],
        "t_threshold": [3.1, 12.0],
        "t_max": r(tmap.max(), 1),
        "active_voxels_truth": int(act.sum()),
        "active_voxels_t31": int((tmap > 3.1).sum()),
        "cluster_curve": [r(v, 1) for v in arr[:, act].mean(1)] if act.any() else [],
        "paradigm": [int(v) for v in box],
        "cluster_slice_extent": [int(i + 1) for i in np.where(act.any((1, 2)))[0]],
        "has_active": bool(cl.any()),
    }


# ── FLAIR follow-up ───────────────────────────────────────────────────────────
def flair(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    base, ds = load_series(ph / "flair_baseline" / "dicom")
    fu, _ = load_series(ph / "flair_followup" / "dicom")
    b, f = base[0], fu[0]
    nz = b.shape[0]
    # choose the slice with the largest difference
    z = int(np.argmax(np.abs(f - b).sum((1, 2))))
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
    save_gray(img / "flair_followup_cor.png", ndimage.zoom(f[:, f.shape[1] // 2, :], (f.shape[2] / nz, 1), order=1), glo, ghi)
    save_gray(img / "flair_followup_sag.png", ndimage.zoom(f[:, :, f.shape[2] // 2], (f.shape[1] / nz, 1), order=1), glo, ghi)
    tb = np.load(ph / "flair_baseline" / "truth.npz")["volumes_vox"]
    tf = np.load(ph / "flair_followup" / "truth.npz")["volumes_vox"]
    vox_ml = float(ds[0].PixelSpacing[0]) ** 2 * float(ds[0].SliceThickness) / 1000.0
    data["flair"] = {
        "slice": z + 1,
        "slices": nz,
        "voxel_ml": r(vox_ml, 4),
        "lesion_volumes_ml_baseline": [r(v * vox_ml, 2) for v in tb],
        "lesion_volumes_ml_followup": [r(v * vox_ml, 2) for v in tf],
        "change_threshold": r(thr, 1),
        "change_window": [r(-rng, 1), r(rng, 1)],
    }


# ── Co-registration review (design-only residual offset, see module docstring) ─
def coreg(ph: Path, img: Path, data: dict, luts: dict[str, np.ndarray]) -> None:
    ref, ds = load_series(ph / "flair_baseline" / "dicom")
    mov, _ = load_series(ph / "flair_followup" / "dicom")
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
    for i, c in enumerate(roi, start=1):
        lines.append(f"  --nm-roi-{i}: {c};")
    for k, c in mm.items():
        lines.append(f"  --nm-mismatch-{k}: {c};")
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
    data: dict = {}
    dsc(a.phantoms, img, data, luts)
    dti(a.phantoms, img, data, luts, mm)
    ivim(a.phantoms, img, data, luts)
    dce(a.phantoms, img, data, luts)
    fmri(a.phantoms, img, data, luts)
    flair(a.phantoms, img, data, luts)
    coreg(a.phantoms, img, data, luts)
    mrs(a.phantoms, data)
    (dat / "_deficit.npy").unlink(missing_ok=True)
    (dat / "_deficit_px.npy").unlink(missing_ok=True)
    (dat / "phantom-data.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    write_luts_css(a.out, lut_pts, roi, mm)
    print(f"wrote {len(list(img.glob('*.png')))} images and phantom-data.json to {a.out}")


if __name__ == "__main__":
    main()
