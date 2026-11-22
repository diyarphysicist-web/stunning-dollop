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


def sprite() -> str:
    src = (SCREENS / "icons.svg").read_text(encoding="utf-8")
    return src[src.index("<svg") :].strip()


GENERATORS = {"sprite": sprite, "aif-grid": aif_grid, "aif-average": aif_average, "mm-signal": mm_signal}


def main() -> None:
    pat = re.compile(r"(<!-- gen:([\w-]+) -->)(.*?)(<!-- /gen:\2 -->)", re.S)
    for html in sorted(SCREENS.glob("*.html")):
        src = html.read_text(encoding="utf-8")
        hits: list[str] = []

        def sub(m: re.Match[str]) -> str:
            hits.append(m.group(2))
            return f"{m.group(1)}\n{GENERATORS[m.group(2)]()}\n{m.group(4)}"

        out = pat.sub(sub, src)
        if hits:
            html.write_text(out, encoding="utf-8", newline="\n")
            print(f"{html.name}: {', '.join(hits)}")


if __name__ == "__main__":
    main()
