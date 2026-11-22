"""Compose batch 6 dialog screens over the DSC workspace (screen 03)."""
import re
from pathlib import Path

S = Path("design/screens")
base = (S / "03-dsc-perfusion.html").read_text(encoding="utf-8")
base = re.sub(r"<!-- Icon sprite.*?</svg>\n", "<!-- gen:sprite -->\n<!-- /gen:sprite -->\n", base, count=1, flags=re.S)
base = re.sub(r"  <!-- =+ Context menu.*?\n  </div>\n(?=\n</div>\n</body>)", "", base, flags=re.S)
assert "menu__item" not in base


def compose(name: str, title: str, overlay: str, comment: str) -> None:
    s = base.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", f"<title>NeuroMR-PRO · {title}</title>")
    s = s.replace("\n</div>\n</body>", f"\n  <!-- {comment} -->\n{overlay}\n</div>\n</body>")
    (S / f"{name}.html").write_text(s, encoding="utf-8", newline="\n")


def check(label: str, on: bool = True, extra: str = "", disabled: str = "") -> str:
    cls = "check is-checked" if on else "check"
    dis = f' aria-disabled="true" title="{disabled}"' if disabled else ""
    tail = f' <span class="t3">{extra}</span>' if extra else ""
    return f'<label class="{cls}"{dis}><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>{label}{tail}</label>'


gen = f'''  <div class="scrim" data-od-id="generate-series">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="gs-title" style="width: calc(var(--nm-space-12) * 12)">
      <div class="dialog__head"><h2 class="dialog__title" id="gs-title">Generate series</h2><button class="ibtn" aria-label="Close (Esc)"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="dialog__body">
        <label class="field"><span class="field__label">Series name</span><span class="input"><span class="input__value">DSC maps model-free</span></span></label>
        <div class="field"><span class="field__label">Format</span>
          <div class="seg" role="radiogroup" aria-label="Format"><button class="seg__item is-selected" role="radio" aria-checked="true">Secondary Capture</button><button class="seg__item" role="radio">SC-RGB</button></div>
          <span class="field__hint">Secondary Capture keeps values with rescale slope, intercept and units; SC-RGB burns in the LUT for viewing only.</span>
        </div>
        <div class="grid2">
          <div class="field"><span class="field__label">Maps</span>
            {check("relCBV", True, "a.u.")}
            {check("relCBF", True, "a.u.")}
            {check("MTT", True, "s")}
            {check("TTP", True, "s")}
            {check("T0", False, "s")}
            {check("Tmax / Delay", False, "needs Manual AIF", "Tmax needs the Manual AIF deconvolution method")}
          </div>
          <div class="field"><span class="field__label">Options</span>
            {check("Register data while saving", False)}
            <span class="field__hint">Motion correction runs before the saved maps are computed, so saved maps can differ from the preview.</span>
            <label class="field"><span class="field__label">Destination</span><div class="select select--dense"><span class="input__value">Local store · this study</span><svg class="ic"><use href="#i-chev-down"/></svg></div></label>
          </div>
        </div>
        <dl>
          <div class="kv"><dt>Source series</dt><dd>DSC perf SNR50 · 150</dd></div>
          <div class="kv"><dt>Method and settings recorded</dt><dd>Model-free · smoothing none</dd></div>
          <div class="kv"><dt>Images</dt><dd>4 maps × 4 slices = 16</dd></div>
        </dl>
      </div>
      <div class="dialog__foot"><button class="btn btn--secondary">Cancel <span class="kbd">Esc</span></button><button class="btn btn--primary">Generate <span class="kbd">Enter</span></button></div>
    </div>
  </div>'''
compose("16-generate-series", "Generate Series", gen, "Generate Series dialog (GEN-160…162), opened with Ctrl+G")

tables = f'''  <div class="scrim" data-od-id="save-tables">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="st-title" style="width: calc(var(--nm-space-12) * 11)">
      <div class="dialog__head"><h2 class="dialog__title" id="st-title">Save all tables</h2><button class="ibtn" aria-label="Close (Esc)"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="dialog__body">
        <div class="field"><span class="field__label">Format</span>
          <div class="seg" role="radiogroup" aria-label="Format"><button class="seg__item is-selected" role="radio" aria-checked="true">CSV</button><button class="seg__item" role="radio">HTML</button><button class="seg__item" role="radio">DICOM SC</button></div>
        </div>
        {check("Include all graphs as PNG", True)}
        <label class="field"><span class="field__label">Destination folder</span><span class="input"><span class="input__value mono">D:\\Exports\\NMR-PHANTOM-001\\2026-01-01</span><button class="link dense">Browse…</button></span></label>
        <table class="tbl tbl--dense">
          <colgroup><col><col style="width:22%"><col style="width:26%"></colgroup>
          <thead><tr><th>Table</th><th class="num">Rows</th><th>File</th></tr></thead>
          <tbody>
            <tr><td>Region parameters · slice 4/8</td><td class="num">3</td><td class="mono">regions.csv</td></tr>
            <tr><td>Ratio ROI1 / ROI1-mirror</td><td class="num">3</td><td class="mono">ratios.csv</td></tr>
            <tr><td>ROI dynamic values · ΔR2*</td><td class="num">60</td><td class="mono">curves.csv</td></tr>
            <tr><td>Graph · concentration-time</td><td class="num">—</td><td class="mono">graph.png</td></tr>
          </tbody>
        </table>
        <span class="field__hint">Files carry patient and study identifiers and flag non-default settings.</span>
      </div>
      <div class="dialog__foot"><button class="btn btn--secondary">Cancel <span class="kbd">Esc</span></button><button class="btn btn--primary">Save <span class="kbd">Enter</span></button></div>
    </div>
  </div>'''
compose("16-save-tables", "Save All Tables", tables, "Save all tables dialog (GEN-170, GEN-171), opened with Ctrl+S")


def mini(cols: int, rows: int, labels: list[str] | None = None, big: bool = False) -> str:
    cells = "".join(f"<span>{(labels or [''] * cols * rows)[i]}</span>" for i in range(cols * rows))
    cls = "mini-grid mini-grid--big" if big else "mini-grid"
    return f'<div class="{cls}" style="grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr))">{cells}</div>'


presets_rows = "".join(
    f'<div class="lx__item{" is-selected" if n == "DSC reading 2×2" else ""}" style="grid-template-columns: auto minmax(0, 1fr) auto">{mini(c, r)}<span class="lx__name">{n}</span><span class="t3">{k}</span></div>'
    for n, c, r, k in (
        ("1×1", 1, 1, "System"), ("1×2", 2, 1, "System"), ("2×1", 1, 2, "System"), ("2×2", 2, 2, "System · active"),
        ("2×3", 3, 2, "System"), ("3×3", 3, 3, "System"), ("DSC reading 2×2", 2, 2, "User"), ("Mismatch 2×3", 3, 2, "User"),
    )
)
layouts = f'''  <div class="scrim" data-od-id="layout-presets">
    <div class="dialog dialog--xl" role="dialog" aria-modal="true" aria-labelledby="lp-title">
      <div class="dialog__head"><h2 class="dialog__title" id="lp-title">Layout presets</h2><button class="ibtn" aria-label="Close (Esc)"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="dialog__body" style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--nm-space-6)">
        <div class="field"><span class="field__label">Presets</span><div class="lx" role="listbox">{presets_rows}</div></div>
        <div class="field">
          <span class="field__label">DSC reading 2×2 <span class="t3">User preset</span></span>
          {mini(2, 2, ["1 · Source<br><span class='t3'>DSC dynamic</span>", "2 · Live maps<br><span class='t3'>relCBV</span>", "3 · Table", "4 · Graph"], True)}
          <dl>
            <div class="kv"><dt>Viewport 1</dt><dd>Series type DSC · dynamic 1</dd></div>
            <div class="kv"><dt>Viewport 2</dt><dd>Map relCBV · Stroke LUT</dd></div>
            <div class="kv"><dt>Viewport 3 / 4</dt><dd>Table · Graph</dd></div>
          </dl>
          <span class="field__hint">The next case reloads the matching series type in each viewer.</span>
          <div class="psec__row"><button class="btn btn--secondary btn--dense">Save current layout as… <span class="kbd">Ctrl+Shift+L</span></button><button class="btn btn--ghost btn--dense">Rename</button><span class="spacer"></span><button class="btn btn--destructive btn--dense">Delete</button></div>
          <span class="field__hint">System presets and the active preset cannot be deleted.</span>
        </div>
      </div>
      <div class="dialog__foot"><button class="btn btn--secondary">Close <span class="kbd">Esc</span></button><button class="btn btn--primary">Apply preset <span class="kbd">Enter</span></button></div>
    </div>
  </div>'''
compose("17-layout-presets", "Layout Presets", layouts, "Layout preset manager (GEN-150…152), opened from the layout picker")


def krows(items: list[tuple[str, str]]) -> str:
    return "".join(f'<div class="krow"><span>{a}</span><span class="kbd">{k}</span></div>' for a, k in items)


sheet = f'''  <div class="scrim" data-od-id="shortcut-sheet">
    <div class="dialog dialog--xl" role="dialog" aria-modal="true" aria-labelledby="ks-title">
      <div class="dialog__head"><h2 class="dialog__title" id="ks-title">Keyboard shortcuts</h2><div class="search" style="width: calc(var(--nm-space-12) * 5)"><svg class="ic"><use href="#i-search"/></svg><span>Filter shortcuts</span></div><button class="ibtn" aria-label="Close (Esc or ?)"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="dialog__body">
        <div class="sheet">
          <div><h3>Global</h3>{krows([("Directory", "Ctrl+1"), ("Viewer", "Ctrl+2"), ("Analysis", "Ctrl+3"), ("Reports", "Ctrl+4"), ("Settings", "Ctrl+,"), ("Search studies", "Ctrl+K"), ("Shortcut sheet", "?"), ("Lock workstation", "Win+L")])}</div>
          <div><h3>Viewer tools</h3>{krows([("Scroll", "S"), ("Pan", "P"), ("Zoom", "Z"), ("Window / level", "W"), ("Mask", "M"), ("Reset view", "R"), ("Mirror line", "L"), ("Mirror L↔R", "Shift+H"), ("Flip U↔D", "Shift+V"), ("Rotate 90°", "Ctrl+R")])}</div>
          <div><h3>ROIs and results</h3>{krows([("Ellipse ROI", "E"), ("Spline ROI", "C"), ("Freehand ROI", "F"), ("Delete ROI", "Del"), ("Duplicate ROI", "Ctrl+D"), ("Undo", "Ctrl+Z"), ("Redo", "Ctrl+Y"), ("Window from ROI", "Shift+W")])}</div>
          <div><h3>Task guidance</h3>{krows([("Next step", "Ctrl+Enter"), ("Collapse panel", "Ctrl+B"), ("Inspector", "I"), ("Bookmarks", "B"), ("Layout picker", "Ctrl+L")])}</div>
          <div><h3>Output</h3>{krows([("Generate series", "Ctrl+G"), ("Save tables", "Ctrl+S"), ("Report", "Ctrl+P"), ("Copy table", "Ctrl+C")])}</div>
          <div><h3>Viewports</h3>{krows([("Previous / next slice", "↑ ↓"), ("Previous / next dynamic", "← →"), ("Maximise viewport", "Enter"), ("Next viewport", "Tab"), ("Context menu", "Shift+F10")])}</div>
        </div>
      </div>
      <div class="dialog__foot"><span class="dense t3">Every toolbar and context-menu action lists its shortcut in its tooltip.</span><span class="spacer"></span><button class="btn btn--secondary">Print sheet</button><button class="btn btn--primary">Close <span class="kbd">Esc</span></button></div>
    </div>
  </div>'''
compose("17-shortcuts", "Keyboard Shortcuts", sheet, "Shortcut sheet (UX law 6), opened with ?")
print("ok")
