"""Inject SVG plots generated from design/assets/data/phantom-data.json into the screens.

Usage (repository root, after render_phantom_imagery.py):
    python design/tools/inject_plots.py

Each screen marks a generated region with
    <!-- gen:NAME -->  …  <!-- /gen:NAME -->
and this tool replaces everything between the markers, so curves in the design are
always the phantom values, never hand-typed. Styling comes from shell.css classes only.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT / "design/assets/data/phantom-data.json").read_text(encoding="utf-8"))
SCREENS = ROOT / "design/screens"
NL = chr(10)

# Shared graph frame (matches screen 03): viewBox 640 × 452, plot area x 56…620, y 36…404
W, H, X0, X1, Y0, Y1 = 640, 452, 56.0, 620.0, 36.0, 404.0


def f1(v: float) -> str:
    return f"{v:.1f}"


def tick_label(v: float) -> str:
    s = f"{v:g}"
    return s.replace("-", "−")


def axes(xticks: list[float], yticks: list[float], xr: tuple[float, float], yr: tuple[float, float], xlabel: str, ylabel: str, frame: tuple[float, float, float, float] = (X0, X1, Y0, Y1)) -> tuple[list[str], callable, callable]:
    x0, x1, y0, y1 = frame
    sx = lambda v: x0 + (v - xr[0]) / (xr[1] - xr[0]) * (x1 - x0)  # noqa: E731
    sy = lambda v: y1 - (v - yr[0]) / (yr[1] - yr[0]) * (y1 - y0)  # noqa: E731
    out = ['<g class="g-grid">']
    out += [f'<line x1="{f1(x0)}" y1="{f1(sy(v))}" x2="{f1(x1)}" y2="{f1(sy(v))}"/>' for v in yticks]
    out += [f'<line x1="{f1(sx(v))}" y1="{f1(y0)}" x2="{f1(sx(v))}" y2="{f1(y1)}"/>' for v in xticks]
    out.append("</g>")
    if yr[0] < 0 < yr[1]:
        out.append(f'<line class="g-zero" x1="{f1(x0)}" y1="{f1(sy(0))}" x2="{f1(x1)}" y2="{f1(sy(0))}"/>')
    out.append(f'<line class="g-axis" x1="{f1(x0)}" y1="{f1(y0)}" x2="{f1(x0)}" y2="{f1(y1)}"/>')
    out.append(f'<line class="g-axis" x1="{f1(x0)}" y1="{f1(y1)}" x2="{f1(x1)}" y2="{f1(y1)}"/>')
    out.append('<g class="g-tick" text-anchor="end">' + "".join(f'<text x="{f1(x0 - 6)}" y="{f1(sy(v) + 4)}">{tick_label(v)}</text>' for v in yticks) + "</g>")
    out.append('<g class="g-tick" text-anchor="middle">' + "".join(f'<text x="{f1(sx(v))}" y="{f1(y1 + 16)}">{tick_label(v)}</text>' for v in xticks) + "</g>")
    out.append(f'<text class="g-title" x="{f1((x0 + x1) / 2)}" y="{f1(y1 + 38)}" text-anchor="middle">{xlabel}</text>')
    cy = (y0 + y1) / 2
    out.append(f'<text class="g-title" x="16" y="{f1(cy)}" text-anchor="middle" transform="rotate(-90 16 {f1(cy)})">{ylabel}</text>')
    return out, sx, sy


def poly(cls: str, xs: list[float], ys: list[float], sx, sy) -> str:
    pts = " ".join(f"{f1(sx(x))},{f1(sy(y))}" for x, y in zip(xs, ys, strict=True))
    return f'<polyline class="{cls}" points="{pts}"/>'


# ── Define AIF ────────────────────────────────────────────────────────────────
def aif_grid() -> str:
    """7 × 7 per-voxel curve grid; selected voxels highlighted. viewBox 700 × 700."""
    box = DATA["dsc"]["aif_box"]
    curves, sel = box["curves"], set(box["selected"])
    lo = min(min(c) for c in curves)
    hi = max(max(c) for c in curves)
    cell, pad = 100.0, 8.0
    out = []
    for i, c in enumerate(curves):
        r, k = divmod(i, 7)
        x, y = k * cell, r * cell
        on = i in sel
        out.append(f'<rect class="aif-cell{" aif-cell--on" if on else ""}" x="{f1(x + 1)}" y="{f1(y + 1)}" width="{f1(cell - 2)}" height="{f1(cell - 2)}"/>')
        zero = y + cell - pad - (0 - lo) / (hi - lo) * (cell - 2 * pad)
        out.append(f'<line class="aif-zero" x1="{f1(x + pad)}" y1="{f1(zero)}" x2="{f1(x + cell - pad)}" y2="{f1(zero)}"/>')
        n = len(c)
        pts = " ".join(f"{f1(x + pad + j / (n - 1) * (cell - 2 * pad))},{f1(y + cell - pad - (v - lo) / (hi - lo) * (cell - 2 * pad))}" for j, v in enumerate(c))
        out.append(f'<polyline class="g-curve {"g-curve--sel" if on else "g-curve--muted"}" points="{pts}"/>')
        out.append(f'<text class="aif-idx{" aif-idx--on" if on else ""}" x="{f1(x + pad)}" y="{f1(y + pad + 10)}">{r + 1},{k + 1}</text>')
    return "\n".join(out)


def aif_average() -> str:
    d = DATA["dsc"]
    t = d["curves"]["times_s"]
    avg = d["aif_box"]["average"]
    hi = max(avg)
    top = 2.0 if hi <= 2.0 else float(int(hi) + 1)
    yt = [v / 2 for v in range(-1, int(top * 2) + 1)] if top <= 3 else list(range(0, int(top) + 1))
    out, sx, sy = axes([0, 20, 40, 60, 80, 100, 120], yt, (0, 126), (yt[0], yt[-1]), "Time [s]", "ΔR2* [1/s]")
    k = max(range(len(avg)), key=lambda i: avg[i])
    out.append(f'<line class="g-marker" x1="{f1(sx(t[k]))}" y1="{f1(Y0 - 6)}" x2="{f1(sx(t[k]))}" y2="{f1(Y1)}"/>')
    out.append(f'<text class="g-marker-label" x="{f1(sx(t[k]) + 4)}" y="{f1(Y0 - 8)}">Peak {avg[k]:.2f} 1/s · {t[k]:.1f} s</text>')
    out.append(poly("g-curve g-curve--contra", t, d["curves"]["roi1_mirror"], sx, sy))
    out.append(poly("g-curve g-curve--aif", t, avg, sx, sy))
    return "\n".join(out)


# ── Mismatch ──────────────────────────────────────────────────────────────────
def mm_signal() -> str:
    d = DATA["dsc"]
    t = d["curves"]["times_s"]
    a, b = d["mismatch"]["signal_deficit"], d["mismatch"]["signal_contra"]
    lo = min(min(a), min(b))
    hi = max(max(a), max(b))
    span = hi - lo
    step = next(v for v in (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000) if span / v <= 6)
    y0 = step * int(lo // step)
    y1 = step * int(hi // step + 1)
    out, sx, sy = axes([0, 20, 40, 60, 80, 100, 120], list(range(y0, y1 + 1, step)), (0, 126), (y0, y1), "Time [s]", "Signal [a.u.]")
    out.append(poly("g-curve g-curve--deficit", t, a, sx, sy))
    out.append(poly("g-curve g-curve--contra", t, b, sx, sy))
    return "\n".join(out)


def topbar(studies: str = '<span class="bf"><span class="bf__k">Study</span><span class="bf__v">2026-01-01</span></span>') -> str:
    return f'''<header class="topbar" data-od-id="topbar">
    <div class="brand"><svg class="ic brand__mark"><use href="#i-brand"/></svg>NeuroMR-PRO</div>
    <div class="banner" data-od-id="patient-banner" aria-label="Patient">
      <span class="banner__name">PHANTOM^SYNTHETIC</span>
      <span class="bf"><span class="bf__k">ID</span><span class="bf__v mono">NMR-PHANTOM-001</span></span>
      <span class="bf"><span class="bf__k">Sex</span><span class="bf__v">O</span></span>
      <span class="bf"><span class="bf__k">Age</span><span class="bf__v">56 y</span><span class="bf__k">(DOB 1970-01-01)</span></span>
      {studies}
      <span class="bf"><span class="bf__k">Modality</span><span class="bf__v">MR · 3.0 T</span></span>
      <span class="bf"><span class="bf__k">Acc</span><span class="bf__v mono">PHANTOM0001</span></span>
    </div>
    <div class="topbar__actions">
      <button class="ibtn" aria-label="Search studies (Ctrl+K)"><svg class="ic"><use href="#i-search"/></svg></button>
      <button class="ibtn" aria-label="Keyboard shortcuts (?)"><svg class="ic"><use href="#i-keyboard"/></svg></button>
      <button class="ibtn" aria-label="Account and sign out"><svg class="ic"><use href="#i-user"/></svg></button>
      <div class="winctl">
        <button aria-label="Minimise"><svg class="ic ic--sm"><use href="#i-min"/></svg></button>
        <button aria-label="Maximise"><svg class="ic ic--sm"><use href="#i-max"/></svg></button>
        <button class="winctl__close" aria-label="Close"><svg class="ic ic--sm"><use href="#i-close"/></svg></button>
      </div>
    </div>
  </header>'''


def topbar_none() -> str:
    """Top bar with no patient context (empty Directory): the banner says so instead of staying blank."""
    s = topbar()
    start, end = s.index('<div class="banner"'), s.index('<div class="topbar__actions">')
    return s[:start] + '<div class="banner" data-od-id="patient-banner" aria-label="Patient"><span class="t2">No patient selected</span></div>' + NL + "    " + s[end:]


def rail(active: str) -> str:
    items = [("Directory", "directory", "Ctrl+1"), ("Viewer", "viewer", "Ctrl+2"), ("Analysis", "analysis", "Ctrl+3"), ("Reports", "reports", "Ctrl+4"), ("Settings", "settings", "Ctrl+,")]
    out = ['<nav class="rail" aria-label="Activities" data-od-id="activity-rail">']
    for name, icon, key in items:
        cls = "rail__item" + (" is-active" if name.lower() == active else "") + (" rail__end" if name == "Settings" else "")
        cur = ' aria-current="page"' if name.lower() == active else ""
        out.append(f'    <button class="{cls}"{cur} aria-label="{name} ({key})"><svg class="ic"><use href="#i-{icon}"/></svg>{name}</button>')
    out.append("  </nav>")
    return NL.join(out)


def statusbar(state: str = '<span class="dot dot--success"></span><b>Maps up to date</b>') -> str:
    return f'''<footer class="statusbar" data-od-id="statusbar">
    <span class="sb-item"><svg class="ic"><use href="#i-jobs"/></svg>Jobs <b>0 running</b></span>
    <span class="sb-sep"></span>
    <span class="sb-item">{state}</span>
    <span class="sb-sep"></span>
    <span class="sb-item"><svg class="ic"><use href="#i-engine"/></svg>Engine <span class="dot dot--success"></span><b>connected</b> · local</span>
    <span class="sb-sep"></span>
    <span class="sb-item">Licence <b>active</b></span>
    <span class="spacer"></span>
    <span class="sb-item"><svg class="ic"><use href="#i-display"/></svg><b>Diagnostic display</b></span>
    <span class="sb-sep"></span>
    <span class="sb-item"><span class="kbd">?</span> shortcuts</span>
  </footer>'''


STATUS = {
    "dir": '<span class="dot dot--warning"></span><b>Pre-processing 1 series</b> · DTI multishell 64 %',
    "report": '<span class="dot dot--success"></span><b>Report ready</b> · 1 page · A4',
    "idle": '<span class="dot dot--idle"></span><b>No study open</b>',
    "import": '<span class="dot dot--warning"></span><b>Importing</b> · 412 / 1 849 files · 22 %',
    "settings": '<span class="dot dot--success"></span><b>Settings saved</b> · changes apply to new sessions',
    "sub": '<span class="dot dot--success"></span><b>S − 1.00·R</b> · dyn 2–12 − dyn 1 · 0 divisions by zero',
    "echo": '<span class="dot dot--success"></span><b>Σ echoes 1–4</b> · live preview',
    "lba": '<span class="dot dot--success"></span><b>Registered</b> · 5 findings · 2 time points',
    "trk": '<span class="dot dot--success"></span><b>2 bundles · 50 fibers</b> · tracking rules FA 0.20 / 45° / 10 mm',
    "fmri": '<span class="dot dot--success"></span><b>SPMs up to date</b> · Block · 1 task',
    "mrs": '<span class="dot dot--success"></span><b>Processed</b> · voxel quality good',
    "preview": '<span class="dot dot--success"></span><b>Live preview</b> · ADC, eADC and DWI-iso compute on Generate',
}


def sprite() -> str:
    src = (SCREENS / "icons.svg").read_text(encoding="utf-8")
    return src[src.index("<svg") :].strip()


# ── DCE / T1 Perfusion (semi-quantitative preview, DCE-005/006) ───────────────
DCE_ROIS = {"ROI1": "class2", "ROI2": "class1", "ROI3": "class3"}


def _line(ts: list[float], ys: list[float]) -> tuple[float, float, float]:
    n = len(ts)
    mt, my = sum(ts) / n, sum(ys) / n
    sxx = sum((t - mt) ** 2 for t in ts)
    b = sum((t - mt) * (y - my) for t, y in zip(ts, ys, strict=True)) / sxx
    a = my - b * mt
    sse = sum((y - (a + b * t)) ** 2 for t, y in zip(ts, ys, strict=True))
    return a, b, sse


def dce_params(c: list[float], t: list[float], cur: int) -> dict[str, float]:
    s0 = (c[0] + c[1]) / 2
    i0 = next(i for i, v in enumerate(c) if v >= 1.2 * s0)
    ip = max(range(len(c)), key=lambda i: c[i])
    a = max(i0 - 1, 0)
    n = len(c)
    best = None
    for k in range(a + 2, n - 1):  # bilinear fit: wash-in a..k, wash-out k..n-1, best knee by SSE (> 8 dynamics)
        l1, l2 = _line(t[a : k + 1], c[a : k + 1]), _line(t[k:], c[k:])
        if best is None or l1[2] + l2[2] < best[0]:
            best = (l1[2] + l2[2], k, l1, l2)
    _, k, l1, l2 = best
    area = sum((max(c[i] - s0, 0) + max(c[i + 1] - s0, 0)) / 2 * (t[i + 1] - t[i]) for i in range(n - 1))
    return {
        "S0": s0, "T0": t[i0], "TTP": t[ip], "MAXENH": c[ip] - s0, "MAXRELENH": 100 * (c[ip] - s0) / s0,
        "RELENH": 100 * (c[cur - 1] / c[0] - 1), "WASHIN": l1[1], "WASHOUT": l2[1],
        "BREVENH": (t[k] + t[-1]) / 2 - (t[a] + t[k]) / 2, "AREACURV": area,
        "_fit": (t[a], t[k], t[-1], l1, l2),
    }


def _dce_all() -> tuple[list[float], dict[str, dict[str, float]], int]:
    d = DATA["dce"]
    cur = d["source_dynamic"]
    return d["times_s"], {r: dce_params(d["curves"][c], d["times_s"], cur) for r, c in DCE_ROIS.items()}, cur


def dce_graph() -> str:
    t, ps, cur = _dce_all()
    d = DATA["dce"]
    out, sx, sy = axes([0, 20, 40, 60, 80, 100, 120], [100, 200, 300, 400, 500, 600, 700, 800], (0, 115), (100, 800), "Time [s]", "Signal [a.u.]")
    for x, lab in ((t[0], "Ref · Dyn 1"), (t[cur - 1], f"Dyn {cur} · {t[cur - 1]:.0f} s")):
        out.append(f'<line class="g-marker" x1="{f1(sx(x))}" y1="{f1(Y0 - 6)}" x2="{f1(sx(x))}" y2="{f1(Y1)}"/>')
        out.append(f'<text class="g-marker-label" x="{f1(sx(x) + 4)}" y="{f1(Y0 - 8)}">{lab}</text>')
    for i, (roi, cls) in enumerate(DCE_ROIS.items(), start=1):
        out.append(poly(f"g-curve g-curve--{i}", t, d["curves"][cls], sx, sy))
    ta, tk, te, l1, l2 = ps["ROI1"]["_fit"]
    out.append(f'<polyline class="g-fit" points="{f1(sx(ta))},{f1(sy(l1[0] + l1[1] * ta))} {f1(sx(tk))},{f1(sy(l1[0] + l1[1] * tk))}"/>')
    out.append(f'<polyline class="g-fit" points="{f1(sx(tk))},{f1(sy(l2[0] + l2[1] * tk))} {f1(sx(te))},{f1(sy(l2[0] + l2[1] * te))}"/>')
    return NL.join(out)


def dce_table() -> str:
    _, ps, cur = _dce_all()
    rows = [
        ("RELENH", f"Dyn {cur}", "%", 1), ("MAXRELENH", "", "%", 1), ("MAXENH", "", "a.u.", 1), ("S0", "", "a.u.", 1),
        ("T0", "", "s", 1), ("TTP", "", "s", 1), ("WASHIN", "fit", "a.u./s", 2), ("WASHOUT", "fit", "a.u./s", 2),
        ("BREVENH", "fit", "s", 1), ("AREACURV", "", "a.u.·s", 0),
    ]
    out = []
    for key, note, unit, nd in rows:
        cells = "".join(f'<td class="num">{tick_label(round(ps[r][key], nd)) if nd else f"{ps[r][key]:,.0f}".replace(",", " ")}</td>' for r in DCE_ROIS)
        n = f' <span class="t3">{note}</span>' if note else ""
        out.append(f'<tr><td class="strong">{key}{n}</td>{cells}<td class="t2">{unit}</td></tr>')
    return NL.join(out)


# ── Permeability (phantom tissue classes; maps from ground truth, see renderer) ─
PERM_ROIS = {"ROI1": "class2", "ROI2": "class1", "ROI3": "class3"}


def perm_graph() -> str:
    d = DATA["perm"]
    t = d["times_s"]
    out, sx, sy = axes([0, 40, 80, 120, 160, 200, 240], [0, 50, 100, 150, 200], (0, 240), (0, 200), "Time [s]", "Signal [a.u.]")
    for i, cls in enumerate(PERM_ROIS.values(), start=1):
        out.append(poly(f"g-curve g-curve--{i}", t, d["tissue_curves"][cls], sx, sy))
    return NL.join(out)


def perm_table() -> str:
    tr = DATA["perm"]["truth"]
    out = []
    for i, (roi, cls) in enumerate(PERM_ROIS.items(), start=1):
        k = int(cls[-1])
        out.append(
            f'<tr><td class="strong"><span class="swatch" style="--c: var(--nm-roi-{i})"></span>{roi}</td>'
            f'<td class="num">{tr["ktrans"][k]:.3f}</td><td class="num">{tr["kep"][k]:.3f}</td>'
            f'<td class="num">{tr["ve"][k]:.2f}</td><td class="num">{tr["vp"][k]:.3f}</td><td class="num">{tr["t1"][k]:.0f}</td></tr>'
        )
    return NL.join(out)


def mrs_thumb() -> str:
    m = DATA["mrs"]
    ppm, y = m["ppm"], m["real"]
    lo, hi = min(y), max(y)
    pts = " ".join(f"{f1((4.2 - p) / 3.7 * 100)},{f1(92 - (v - lo) / (hi - lo) * 80)}" for p, v in zip(ppm, y, strict=True) if 0.5 <= p <= 4.2)
    return f'<polyline class="g-curve" style="stroke: var(--nm-color-text-primary); stroke-width: 3" points="{pts}"/>'


# ── Brain Function (fMRI) ─────────────────────────────────────────────────────
def fmri_curve() -> str:
    f = DATA["fmri"]
    n, tr = f["dynamics"], f["tr_s"]
    t = [i * tr for i in range(n)]
    y = f["cluster_curve"]
    lo, hi = min(y), max(y)
    step = next(v for v in (1, 2, 5, 10, 20, 50, 100) if (hi - lo) / v <= 6)
    y0, y1 = step * int(lo // step), step * int(hi // step + 1)
    out, sx, sy = axes([0, 40, 80, 120, 160, 200], list(range(y0, y1 + 1, step)), (0, n * tr), (y0, y1), "Time [s]", "Signal [a.u.]")
    shade = [f'<rect class="g-paradigm" x="{f1(sx(o))}" y="{f1(Y0)}" width="{f1(sx(o + d) - sx(o))}" height="{f1(Y1 - Y0)}"/>' for o, d in zip(f["onsets_s"], f["durations_s"], strict=True)]
    out = out[:1] + shade + out[1:]
    out.append(poly("g-curve g-curve--signal", t, y, sx, sy))
    return NL.join(out)


# ── Spectroscopy ──────────────────────────────────────────────────────────────
def mrs_spectrum() -> str:
    m = DATA["mrs"]
    ppm, y, base = m["ppm"], m["real"], m["baseline"]
    top = max(y)
    yt = [0, 200, 400, 600, 800, 1000]
    # wider frame (viewBox 960 × 556) so text keeps the 11 px overlay size in the large spectrum viewport
    out, sx, sy = axes([4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5], yt, (4.2, 0.2), (min(min(y), 0) - 50, 1050), "Chemical shift [ppm]", "Signal [a.u.]", frame=(56.0, 940.0, 36.0, 500.0))
    out.append(poly("g-curve g-curve--base", ppm, base, sx, sy))
    out.append(poly("g-curve g-curve--signal", ppm, y, sx, sy))
    for row in m["table"]:
        out.append(f'<text class="g-peak" x="{f1(sx(row["ppm"]))}" y="{f1(sy(row["height"]) - 8)}" text-anchor="middle">{row["metabolite"]}</text>')
    return NL.join(out)


def mrs_table() -> str:
    m = DATA["mrs"]
    noise = max(r["height"] for r in m["table"]) / m["snr"]
    out = []
    for r in m["table"]:
        out.append(
            f'<tr><td class="strong">{r["metabolite"]}</td><td class="num">{r["ppm"]:.2f}</td><td class="num">{r["height"]:.1f}</td>'
            f'<td class="num">{r["area"]:.2f}</td><td class="num">{m["linewidth_ppm"]:.3f}</td><td class="num">{r["height"] / noise:.1f}</td>'
            f'<td class="num">{r["ratio_cr"]:.2f}</td><td><span class="dot dot--success" style="display: inline-block"></span> Good</td></tr>'
        )
    return NL.join(out)


# ── Longitudinal Brain Analysis ───────────────────────────────────────────────
LBA_DATES = ("2026-01-01", "2026-07-01")


def _lba_change(a: float, b: float) -> str:
    if a == 0 and b > 0:
        return "New"
    if b == 0 and a > 0:
        return "Disappeared"
    rel = (b - a) / a
    return "Stable" if abs(rel) < 0.05 else ("Significantly increased" if rel > 0.5 else "Increased") if rel > 0 else ("Significantly decreased" if rel < -0.5 else "Decreased")


def lba_table() -> str:
    les = DATA["flair"]["lesions"]
    rows = [
        f'<tr{" class=\"is-selected\" aria-selected=\"true\"" if x["name"] == "L1" else ""}><td class="strong">{x["name"]}</td><td class="num">{x["ml_base"]:.3f}</td>'
        f'<td class="num">{x["ml_follow"]:.3f}</td><td>{_lba_change(x["ml_base"], x["ml_follow"])}</td></tr>'
        for x in les
    ]
    tb, tf = sum(x["ml_base"] for x in les), sum(x["ml_follow"] for x in les)
    rows.append(f'<tr class="is-total"><td>Total</td><td class="num">{tb:.3f}</td><td class="num">{tf:.3f}</td><td>{"+" if tf >= tb else "−"}{abs(tf - tb) / tb * 100:.1f} %</td></tr>')
    return NL.join(rows)


def lba_trend() -> str:
    les = DATA["flair"]["lesions"]
    tot = [sum(x["ml_base"] for x in les), sum(x["ml_follow"] for x in les)]
    out, sx, sy = axes([0, 1], [0, 0.2, 0.4, 0.6, 0.8], (-0.25, 1.25), (0, 0.8), "Study date", "Volume [ml]")
    out = [o for o in out if 'text-anchor="middle"><text' not in o]  # replace numeric x ticks with dates
    out.append('<g class="g-tick" text-anchor="middle">' + "".join(f'<text x="{f1(sx(i))}" y="{f1(Y1 + 16)}">{d}</text>' for i, d in enumerate(LBA_DATES)) + "</g>")
    for i, x in enumerate(les, start=1):
        out.append(poly(f"g-curve g-curve--{min(i, 3)}" if i <= 3 else "g-curve g-curve--muted", [0, 1], [x["ml_base"], x["ml_follow"]], sx, sy))
    out.append(poly("g-curve g-curve--aif", [0, 1], tot, sx, sy))
    for i, v in enumerate(tot):
        out.append(f'<circle class="g-fit-dot" cx="{f1(sx(i))}" cy="{f1(sy(v))}" r="3"/>')
    return NL.join(out)


# ── Advanced Diffusion: kurtosis + simplified IVIM fit (ADV-003/007/010) ──────
def _adv_fit() -> dict:
    import numpy as np
    from scipy.optimize import curve_fit

    iv = DATA["ivim"]
    b = np.array(iv["bvals"], float)
    s = np.array(iv["signal_roi1"], float)
    s0 = s[0]
    use = (b == 0) | (b >= 100)  # exclude 0 < b < IVIM threshold 100 s/mm² (ADV-007)

    def model(bb: np.ndarray, f: float, d: float, k: float) -> np.ndarray:
        return np.where(bb == 0, s0, s0 * (1 - f) * np.exp(-bb * d + (bb * d) ** 2 * k / 6))

    p, _ = curve_fit(model, b[use], s[use], p0=(0.1, 1e-3, 0.5), bounds=([0, 1e-5, 0], [0.5, 5e-3, 3]))
    fit = model(b[use], *p)
    nrmse = float(np.sqrt(np.mean((fit - s[use]) ** 2)) / s0)
    r2 = float(1 - np.sum((fit - s[use]) ** 2) / np.sum((s[use] - s[use].mean()) ** 2))
    return {"f": p[0], "d": p[1], "k": p[2], "nrmse": nrmse, "r2": r2, "b": b, "s": s, "use": use, "model": model, "p": p}


def adv_graph() -> str:
    import numpy as np

    a = _adv_fit()
    out, sx, sy = axes([0, 500, 1000, 1500, 2000], [0, 200, 400, 600, 800, 1000], (0, 2100), (0, 1050), "b-value [s/mm²]", "Signal [a.u.]")
    bb = np.linspace(100, 2000, 60)
    out.append(poly("g-curve g-curve--fit", list(bb), list(a["model"](bb, *a["p"])), sx, sy))
    for b, s, u in zip(a["b"], a["s"], a["use"], strict=True):
        cls = "g-fit-dot" if u else "g-peak"
        out.append(f'<circle class="{cls}" cx="{f1(sx(b))}" cy="{f1(sy(s))}" r="{3.5 if u else 3}"/>')
    return NL.join(out)


def adv_values() -> dict:
    a = _adv_fit()
    return {"D": a["d"] * 1e6, "f": a["f"] * 100, "K": a["k"], "nrmse": a["nrmse"] * 100, "r2": a["r2"]}


def adv_table() -> str:
    v = adv_values()
    return (
        f'<tr class="is-selected" aria-selected="true"><td class="strong"><span class="swatch" style="--c: var(--nm-roi-1)"></span>ROI1</td>'
        f'<td class="num">{v["D"]:.0f}</td><td class="num">{v["f"]:.1f}</td><td class="num">{v["K"]:.2f}</td>'
        f'<td class="num">{v["r2"]:.4f}</td><td class="num">{v["nrmse"]:.2f}</td></tr>'
    )


GENERATORS = {"topbar-none": lambda: topbar_none(), "topbar-2": lambda: topbar('<span class="bf"><span class="bf__k">Studies</span><span class="bf__v">2026-01-01 · 2026-07-01</span></span>'), "lba-table": lba_table, "lba-trend": lba_trend, "adv-graph": adv_graph, "adv-table": adv_table, "fmri-curve": fmri_curve, "mrs-spectrum": mrs_spectrum, "mrs-table": mrs_table, "topbar": topbar, "statusbar": statusbar, "dce-graph": dce_graph, "dce-table": dce_table, "perm-graph": perm_graph, "perm-table": perm_table, "mrs-thumb": mrs_thumb, "sprite": sprite, "aif-grid": aif_grid, "aif-average": aif_average, "mm-signal": mm_signal}


def main() -> None:
    pat = re.compile(r"(<!-- gen:([\w-]+) -->)(.*?)(<!-- /gen:\2 -->)", re.S)
    for html in sorted(SCREENS.glob("*.html")):
        src = html.read_text(encoding="utf-8")
        hits: list[str] = []

        def sub(m: re.Match[str]) -> str:
            hits.append(m.group(2))
            name = m.group(2)
            if name.startswith("rail-"):
                body = rail(name[5:])
            elif name.startswith("statusbar-"):
                body = statusbar(STATUS[name[10:]])
            else:
                body = GENERATORS[name]()
            return f"{m.group(1)}\n{body}\n{m.group(4)}"

        out = pat.sub(sub, src)
        if hits:
            html.write_text(out, encoding="utf-8", newline="\n")
            print(f"{html.name}: {', '.join(hits)}")


if __name__ == "__main__":
    main()
