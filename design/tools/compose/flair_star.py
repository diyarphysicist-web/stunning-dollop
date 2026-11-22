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
s = sub(s, r"<!-- Longitudinal Brain Analysis \(LBA-001…043\).*?-->", """<!-- Longitudinal Brain Analysis, FLAIR* mode (LBA-025) with the NAIMS central-vein review (LBA-026) and summary
     (LBA-027). Built by design/tools/compose/flair_star.py from 13-longitudinal. SWI/EPI (swi_epi phantom) is registered
     to the baseline FLAIR (in-plane rigid search, a design preview), both normalised by the 99th percentile in the
     brain, product shown in three planes around L1 at zoom 200 %. Marks shown match the phantom truth: L4 central
     vein, L3 two distinct veins (excluded), L5 no vein; L1 (central vein) is being reviewed. -->""")

finding = lambda name, dot, mark, sel=False: (  # noqa: E731
    f'          <div class="tree__row{" is-selected" if sel else ""}" role="option"{" aria-selected=\"true\"" if sel else ""}>'
    f'<svg class="ic"><use href="#i-freehand"/></svg><span class="tree__dot" style="--c: {dot}"></span>'
    f'<span>{name}</span><span></span>{mark}</div>\n'
)
rows = (
    finding("L1", "var(--nm-roi-1)", '<span class="dense t3">Not reviewed</span>', True)
    + finding("L3", "var(--nm-roi-3)", '<span class="chip">Excluded · multiple veins</span>')
    + finding("L4", "var(--nm-color-text-tertiary)", '<span class="chip">Present</span>')
    + finding("L5", "var(--nm-color-text-tertiary)", '<span class="chip">Absent</span>')
)
MARKS = {"Present": 1, "Absent": 1, "Indeterminate": 0, "Excluded": 1, "Not reviewed": 1}
pos, neg = MARKS["Present"], MARKS["Absent"]
pct = f"{100 * pos / (pos + neg):.0f} %" if pos + neg else "—"
summary = "".join(f'          <div class="kv"><dt>{k}</dt><dd>{v}</dd></div>\n' for k, v in MARKS.items())

s = sub(s, r'  <aside class="panel" aria-label="Longitudinal analysis".*?\n  </aside>\n', f"""  <aside class="panel" aria-label="Longitudinal analysis" data-od-id="task-panel">
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
      <p class="dense t2">FLAIR* · 2026-01-01 · #610 SWI EPI × #600 3D FLAIR</p>
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
        <span class="dense">Registration <span class="t2">rigid · Δy {mm(dy)} mm · Δx {mm(dx)} mm</span></span>
        <div class="psec__row"><span class="chip chip--warning">Registration not reviewed</span><span class="spacer"></span><button class="btn btn--secondary btn--dense">Review…</button></div>
      </section>
      <section class="psec" data-od-id="cvs-review">
        <div class="psec__row"><span class="eyebrow">Central veins · NAIMS</span><span class="spacer"></span><span class="dense t3">3 of 4 reviewed</span></div>
        <div class="tree" role="listbox" aria-label="Findings at 2026-01-01">
{rows}        </div>
      </section>
      <section class="psec" data-od-id="cvs-summary">
        <span class="eyebrow">Summary</span>
        <dl>
{summary}          <div class="kv"><dt>CVS+ of evaluable lesions</dt><dd>{pct} <span class="u">({pos} / {pos + neg})</span></dd></div>
          <div class="kv"><dt>Select-3*</dt><dd>{pos} <span class="u">/ 3 CVS+</span></dd></div>
          <div class="kv"><dt>Select-6*</dt><dd>{pos} <span class="u">/ 6 CVS+</span></dd></div>
        </dl>
        <span class="field__hint">Evaluable = Present + Absent; Indeterminate, Excluded and unreviewed lesions are not counted.</span>
      </section>
    </div>
    <div class="panel__foot">
      <button class="btn btn--primary btn--block">Save FLAIR* series <span class="kbd">Ctrl+G</span></button>
    </div>
  </aside>
""")

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
        br = f'<div class="ov ov--br">Zoom {fs["zoom_pct"]} %</div>' if ck == "prod" else ""
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
s = sub(s, r'\n  <aside class="inspector" aria-label="Finding".*?</aside>\n', f"""
  <aside class="inspector" aria-label="Finding" data-od-id="inspector">
    <div class="inspector__head"><span class="tree__dot" style="--c: var(--nm-roi-1)"></span><h2 class="panel__title">L1</h2><span class="dense t3">Lesion · 2026-01-01</span><span class="spacer"></span><button class="ibtn" aria-label="Close inspector (I)"><svg class="ic"><use href="#i-close"/></svg></button></div>
    <div class="panel__body">
      <section class="section">
        <dl>
          <div class="kv"><dt>Smallest diameter</dt><dd>{fs["min_diameter_mm"]:.1f}<span class="u">mm</span></dd></div>
          <div class="kv"><dt>Centred on</dt><dd>Ax {sl["ax"]} · Cor {sl["cor"]} · Sag {sl["sag"]}</dd></div>
        </dl>
      </section>
      <section class="section" data-od-id="naims-vein">
        <span class="eyebrow">Vein criteria (all five for Present)</span>
          <label class="check check--wrap is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Thin hypointense line or small hypointense dot</label>
          <label class="check check--wrap is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Seen in ≥ 2 perpendicular planes, a thin line in ≥ 1</label>
          <label class="check check--wrap is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Apparent diameter &lt; 2 mm</label>
          <label class="check check--wrap is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Runs partly or entirely through the lesion</label>
          <label class="check check--wrap"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Central in the lesion</label>
      </section>
      <section class="section" data-od-id="cvs-mark">
        <span class="eyebrow">Mark</span>
        <div class="cvs cvs--2" role="radiogroup" aria-label="Central-vein mark for L1">
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" disabled title="Tick all five vein criteria first (1)">Present</button>
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Absent (2)">Absent</button>
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Indeterminate (3)">Indeterminate</button>
          <button class="btn btn--secondary btn--dense" role="radio" aria-checked="false" title="Excluded, choose a reason (4)">Excluded…</button>
        </div>
        <span class="field__hint">Present needs all five criteria. Excluded asks for a reason: lesion &lt; 3 mm, confluent, multiple veins, or poorly visible.</span>
        <span class="field__hint"><span class="kbd">1</span>–<span class="kbd">4</span> mark · <span class="kbd">N</span> next unreviewed</span>
      </section>
      <section class="section" style="border-bottom: 0">
        <div class="notice notice--info" role="note" data-od-id="lba-026"><svg class="ic"><use href="#i-info"/></svg><span class="notice__text">Marks are your reading of all three planes; the app does not detect veins.</span></div>
      </section>
    </div>
  </aside>
""")
s = sub(s, r"\n<!-- dialog -->.*?<!-- /dialog -->\n", "\n")
s = s.replace("<!-- gen:statusbar-lba -->", "<!-- gen:statusbar-fstar -->").replace("<!-- /gen:statusbar-lba -->", "<!-- /gen:statusbar-fstar -->")
(S / "13-flair-star.html").write_text(s, encoding="utf-8", newline="\n")
print("ok")
