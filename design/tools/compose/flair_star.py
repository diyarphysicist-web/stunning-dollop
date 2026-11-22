"""Compose 13-flair-star (LBA-025 FLAIR* mode with the LBA-026 central-vein review) from 13-longitudinal.

Imagery and numbers come from design/assets/data/phantom-data.json ("flair_star"), written by
render_phantom_imagery.py from the swi_epi and flair_baseline phantoms. Run from the repository root,
then inject_plots.py and pnpm design:render 13-flair.
"""
import json
import re
from pathlib import Path

S = Path("design/screens")
D = json.loads(Path("design/assets/data/phantom-data.json").read_text(encoding="utf-8"))
fs = D["flair_star"]
sl, n = fs["centre_slice"], fs["slices"]
dy, dx = fs["shift_mm"]


def sub(s: str, pattern: str, repl: str) -> str:
    out, k = re.subn(pattern, lambda m: repl, s, count=1, flags=re.S)
    assert k == 1, pattern[:70]
    return out


def mm(v: float) -> str:
    return f"{v:+.1f}".replace("-", "−")


s = (S / "13-longitudinal.html").read_text(encoding="utf-8")
s = s.replace("<title>NeuroMR-PRO · Longitudinal Brain Analysis</title>", "<title>NeuroMR-PRO · Longitudinal Brain Analysis · FLAIR*</title>")
s = sub(s, r"<!-- Longitudinal Brain Analysis \(LBA-001…043\).*?-->", """<!-- Longitudinal Brain Analysis, FLAIR* mode (LBA-025) with the central-vein review (LBA-026).
     Built by design/tools/compose/flair_star.py from 13-longitudinal. SWI/EPI (swi_epi phantom) is registered to
     the baseline FLAIR (in-plane rigid search, a design preview), both normalised by the 99th percentile in the
     brain, product shown in three planes around L1 at zoom 200 %. -->""")
s = s.replace('<div class="app">', '<div class="app app--no-inspector">', 1)

finding = lambda name, dot, mark, sel=False: (  # noqa: E731
    f'          <div class="tree__row{" is-selected" if sel else ""}" role="option"{" aria-selected=\"true\"" if sel else ""}>'
    f'<svg class="ic"><use href="#i-freehand"/></svg><span class="tree__dot" style="--c: {dot}"></span>'
    f'<span>{name} · Lesion</span><span></span>{mark}</div>\n'
)
not_reviewed = '<span class="dense t3">Not reviewed</span>'
rows = (
    finding("L1", "var(--nm-roi-1)", not_reviewed, True)
    + finding("L3", "var(--nm-roi-3)", '<span class="chip">Absent</span>')
    + finding("L4", "var(--nm-color-text-tertiary)", '<span class="chip">Present</span>')
    + finding("L5", "var(--nm-color-text-tertiary)", '<span class="chip">Indeterminate</span>')
)

s = sub(s, r'  <aside class="panel" aria-label="Longitudinal analysis".*?\n  </aside>\n', f'''  <aside class="panel" aria-label="Longitudinal analysis" data-od-id="task-panel">
    <div class="panel__switch">
      <div class="seg" role="tablist" aria-label="Left panel">
        <button class="seg__item" role="tab">Series</button>
        <button class="seg__item is-selected" role="tab" aria-selected="true">Package</button>
        <button class="seg__item" role="tab">Key Images</button>
        <button class="seg__item" role="tab">Bookmarks</button>
      </div>
    </div>
    <div class="panel__head">
      <div class="panel__head-row"><h1 class="panel__title">Longitudinal Brain Analysis</h1></div>
      <p class="dense t2">FLAIR* · 2026-01-01 · SWI EPI × 3D FLAIR</p>
    </div>
    <div class="panel__body">
      <section class="psec">
        <span class="eyebrow">Mode</span>
<!-- modes -->
        <div class="seg seg--grid2" role="radiogroup" aria-label="Mode">
          <button class="seg__item" role="radio">Single</button>
          <button class="seg__item" role="radio">Longitudinal</button>
          <button class="seg__item" role="radio">Compare</button>
          <button class="seg__item is-selected" role="radio" aria-checked="true">FLAIR*</button>
        </div>
<!-- /modes -->
      </section>
      <section class="psec" data-od-id="fstar-inputs">
        <span class="eyebrow">Inputs · same time point</span>
        <label class="field"><span class="field__label">SWI/EPI</span><div class="select"><span class="input__value">#610 SWI EPI</span><svg class="ic"><use href="#i-chev-down"/></svg></div></label>
        <label class="field"><span class="field__label">FLAIR</span><div class="select"><span class="input__value">#600 3D FLAIR</span><svg class="ic"><use href="#i-chev-down"/></svg></div></label>
        <span class="field__hint">Picked from the series data types · 1.0 mm slices (≤ 1.5 mm recommended).</span>
        <div class="psec__row"><span class="dense">Registration <span class="t2">rigid · SWI/EPI → FLAIR · Δy {mm(dy)} mm · Δx {mm(dx)} mm</span></span></div>
        <div class="psec__row"><span class="chip chip--warning">Registration not reviewed</span><span class="spacer"></span><button class="btn btn--secondary btn--dense">Review…</button></div>
      </section>
      <section class="psec" data-od-id="cvs-review">
        <div class="psec__row"><span class="eyebrow">Central-vein review</span><span class="spacer"></span><span class="dense t3">3 of 4 reviewed</span></div>
        <div class="tree" role="listbox" aria-label="Findings at 2026-01-01">
{rows}        </div>
        <span class="field__label">L1 · central vein</span>
        <div class="cvs" role="radiogroup" aria-label="Central vein for L1">
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Present (1)">Present</button>
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Absent (2)">Absent</button>
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Indeterminate (3)">Indeterminate</button>
        </div>
        <span class="field__hint"><span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> mark · <span class="kbd">N</span> next unreviewed · Present 1 · Absent 1 · Indeterminate 1</span>
        <div class="notice notice--info" role="note" data-od-id="lba-026"><svg class="ic"><use href="#i-info"/></svg><span class="notice__text">Marks are your reading of all three planes; the app does not detect veins.</span></div>
      </section>
    </div>
    <div class="panel__foot">
      <button class="btn btn--primary btn--block">Save FLAIR* series <span class="kbd">Ctrl+G</span></button>
    </div>
  </aside>
''')

s = sub(s, r'    <button class="picker"><svg class="ic"><use href="#i-layout"/></svg>Preset: FLAIR follow-up.*?</button>',
        '    <button class="picker"><svg class="ic"><use href="#i-layout"/></svg>Layout: 3×3 planes<svg class="ic ic--sm"><use href="#i-chev-down"/></svg></button>')
s = s.replace('    <button class="ibtn is-active" aria-pressed="true" aria-label="Seed-point segmentation (D)">', '    <button class="ibtn" aria-label="Seed-point segmentation (D)">', 1)
s = sub(s, r'    <button class="btn btn--secondary btn--dense"><svg class="ic"><use href="#i-table-save"/></svg>Export CSV.*?</button>',
        '    <span class="dense t3">Pan and zoom linked by row · window by column</span>')

PLANES = (("ax", "Axial", f"Slice {sl['ax']}/{n['ax']}", ("A", "P", "R", "L")),
          ("cor", "Coronal", f"Slice {sl['cor']}/{n['cor']}", ("S", "I", "R", "L")),
          ("sag", "Sagittal", f"Slice {sl['sag']}/{n['sag']}", ("S", "I", "A", "P")))
COLS = (("swi", "SWI/EPI", "SWI EPI · registered", "a.u."), ("flair", "FLAIR", "3D FLAIR", "a.u."), ("prod", "FLAIR*", "FLAIR* · normalised product", ""))
lz = n["ax"] - sl["ax"]  # lesion row in the superior-up reformats (0-based, z flipped)
PX = 512 / 32  # 32-voxel crop drawn at 512
CENTRE = {"ax": (16.5 * PX, 16.5 * PX), "cor": (16.5 * PX, (lz + 0.5) * PX), "sag": (16.5 * PX, (lz + 0.5) * PX)}
R = 4.5 * PX
tiles = []
for pk, pname, pslice, (on, os_, ow, oe) in PLANES:
    for ck, cname, ctitle, unit in COLS:
        lo, hi = fs["windows"][ck]
        w, l = hi - lo, (hi + lo) / 2
        win = f"W {w:.2f} · L {l:.2f}" if ck == "prod" else f"W {w:.1f} · L {l:.1f} <span class=\"t2\">{unit}</span>"
        active = " is-active" if (pk, ck) == ("ax", "prod") else ""
        roi = ""
        if ck == "prod":
            x, y = CENTRE[pk]
            roi = (f'\n          <svg viewBox="0 0 512 512" aria-hidden="true"><circle class="roi roi--1" cx="{x:.0f}" cy="{y:.0f}" r="{R:.0f}"/></svg>'
                   f'\n          <span class="ov roi-label roi-label--1" style="left: {(x + 0.6 * R) / 5.12:.0f}%; top: {(y - 0.75 * R) / 5.12:.0f}%">L1</span>')
        head_extra = f'<span class="dense t2">{pname}</span>' if ck == "swi" else ""
        br = f'<div class="ov ov--br">Zoom 200 %</div>' if ck == "prod" else ""
        tiles.append(f'''    <section class="vp{active}" aria-label="{cname}, {pname.lower()}">
      <div class="vp__head"><span class="vp__role">{cname}</span>{head_extra}<span class="spacer"></span><button class="ibtn ibtn--sm" aria-label="Viewport menu (right-click)"><svg class="ic ic--sm"><use href="#i-more"/></svg></button></div>
      <div class="vp__body vp__body--fit">
        <div class="vp__stage">
          <img src="../assets/img/fstar_{ck}_{pk}.png" width="512" height="512" alt="{cname} {pname.lower()} view centred on L1">{roi}
        </div>
        <div class="ov ov--tl">{ctitle}<br><span class="t2">{pslice}</span></div>
        <div class="ov ov--bl">{win}</div>
        {br}
        <span class="ov orient orient--n">{on}</span><span class="ov orient orient--s">{os_}</span><span class="ov orient orient--w">{ow}</span><span class="ov orient orient--e">{oe}</span>
      </div>
    </section>''')
s = sub(s, r"<!-- main -->.*?<!-- /main -->", "<!-- main -->\n  <main class=\"vgrid vgrid--3x3\" aria-label=\"Viewports\" data-od-id=\"viewport-grid\">\n" + "\n".join(tiles).replace("\n        \n", "\n") + "\n  </main>\n<!-- /main -->")
s = sub(s, r'\n  <aside class="inspector" aria-label="Finding".*?</aside>\n', "\n")
s = sub(s, r"\n<!-- dialog -->.*?<!-- /dialog -->\n", "\n")
s = s.replace("<!-- gen:statusbar-lba -->", "<!-- gen:statusbar-fstar -->").replace("<!-- /gen:statusbar-lba -->", "<!-- /gen:statusbar-fstar -->")
(S / "13-flair-star.html").write_text(s, encoding="utf-8", newline="\n")
print("ok")
