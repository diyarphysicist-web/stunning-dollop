"""Compose batch 6 state screens (18-*) from screens 01, 03 and 05."""
import re
from pathlib import Path

S = Path("design/screens")
d01 = (S / "01-study-directory.html").read_text(encoding="utf-8")
d03 = (S / "03-dsc-perfusion.html").read_text(encoding="utf-8")
d05 = (S / "05-mismatch-2x2.html").read_text(encoding="utf-8")


def sub(s: str, pattern: str, repl: str) -> str:
    out, n = re.subn(pattern, lambda m: repl, s, flags=re.S)
    assert n == 1, pattern[:60]
    return out


def strip_gen(s: str) -> str:
    """Empty generated regions so inject_plots.py refills them."""
    return re.sub(r"(<!-- gen:([\w-]+) -->).*?(<!-- /gen:\2 -->)", r"\1\n\3", s, flags=re.S)


# ── 18 Directory, empty ───────────────────────────────────────────────────────
s = strip_gen(d01)
s = s.replace("<title>NeuroMR-PRO · Study Directory</title>", "<title>NeuroMR-PRO · Study Directory (empty)</title>")
s = s.replace("<!-- gen:topbar -->", "<!-- gen:topbar-none -->").replace("<!-- /gen:topbar -->", "<!-- /gen:topbar-none -->")
s = s.replace('<b>Local store</b><span class="t2">2 studies</span><span class="src__sub">Encrypted cache · 1 patient</span>', '<b>Local store</b><span class="t2">0 studies</span><span class="src__sub">Encrypted cache · empty</span>')
s = sub(s, r'      <section class="psec" style="border-bottom: 0">\n        <div class="notice notice--warning" role="note" data-od-id="dir-006">.*?</section>\n', "")
s = sub(s, r'  <main class="dir".*?</main>', '''  <main class="dir" style="grid-template-rows: minmax(0, 1fr)" aria-label="Studies and series" data-od-id="dir-main">
    <div class="empty empty--big" data-od-id="dir-empty">
      <svg class="ic"><use href="#i-directory"/></svg>
      <span class="empty__title">No studies in the local store</span>
      <span>Import a folder or DICOMDIR, query a PACS node, or send studies to AE NEUROMR on port 11112.</span>
      <div class="psec__row" style="justify-content: center; margin-top: var(--nm-space-3)">
        <button class="btn btn--primary">Import folder… <span class="kbd">Ctrl+O</span></button>
        <button class="btn btn--secondary">DICOMDIR…</button>
        <button class="btn btn--ghost">Query PACS… <span class="kbd">Ctrl+Q</span></button>
      </div>
    </div>
  </main>''')
s = sub(s, r'      <div class="lx" role="listbox" aria-label="Packages">.*?\n      </div>\n    </div>\n    <div class="panel__foot">.*?</div>', '''      <div class="empty" style="padding: var(--nm-space-8) var(--nm-panel-padding)"><svg class="ic"><use href="#i-analysis"/></svg><span>Select a series to see which packages can open it.</span></div>
    </div>''')
s = s.replace('<span class="dense t3">DSC perf SNR50</span>', '<span class="dense t3">No selection</span>')
s = s.replace("<!-- gen:statusbar-dir -->", "<!-- gen:statusbar-idle -->").replace("<!-- /gen:statusbar-dir -->", "<!-- /gen:statusbar-idle -->")
(S / "18-directory-empty.html").write_text(s, encoding="utf-8", newline="\n")

# ── 18 Directory, importing + PACS error ──────────────────────────────────────
s = strip_gen(d01)
s = s.replace("<title>NeuroMR-PRO · Study Directory</title>", "<title>NeuroMR-PRO · Study Directory (importing, PACS error)</title>")
s = sub(s, r'      <section class="psec">\n        <span class="eyebrow">Import</span>.*?</section>\n', '''      <section class="psec" data-od-id="import-progress">
        <span class="eyebrow">Import</span>
        <span class="dense">Folder <span class="mono">E:\\\\PHANTOM</span></span>
        <span class="progress"><span class="progress__bar" style="--v: 22%"></span><span class="progress__pct">22 %</span><span class="t2">412 / 1 849 files</span><button class="link dense">Cancel</button></span>
        <span class="field__hint">Studies appear as soon as their first series is read; packages open after pre-processing.</span>
      </section>
''')
s = sub(s, r'          <div class="src__item"><svg class="ic"><use href="#i-display"/></svg><span>Site PACS</span><span class="dot dot--success"></span><span class="src__sub">AE SITE_PACS · C-ECHO 14 ms</span></div>', '''          <div class="src__item"><svg class="ic"><use href="#i-display"/></svg><span>Site PACS</span><span class="dot dot--critical"></span><span class="src__sub">AE SITE_PACS · no answer</span></div>''')
s = sub(s, r'        <div class="notice notice--warning" role="note" data-od-id="dir-006">.*?</div>', '''        <div class="notice notice--critical" role="alert" data-od-id="pacs-error">
          <svg class="ic"><use href="#i-warn"/></svg>
          <span class="notice__text">Site PACS did not answer the study query within 30 s — check the network link, then <button class="link dense">retry</button>.</span>
        </div>''')
rows = re.search(r'(<tbody>\n            <tr><td><span class="thumb">.*?</tr>\n)(.*?)(          </tbody>\n        </table>\n      </div>\n    </section>\n  </main>)', s, re.S)
first_three = "\n".join(rows.group(1).splitlines()[:2] + rows.group(2).splitlines()[:2]) + "\n"
first_three = first_three.replace('<span class="dot dot--success" style="display: inline-block"></span> Ready', '<span class="progress"><span class="progress__bar" style="--v: 40%"></span><span class="t2">Classifying</span></span>')
first_three = first_three.replace(' class="is-selected" aria-selected="true"', "")
skel = "".join('            <tr><td><span class="thumb"></span></td><td class="num"><span class="skel" style="width: var(--nm-space-6)"></span></td><td><span class="skel" style="width: calc(var(--nm-space-12) * 3)"></span></td><td><span class="skel" style="width: var(--nm-space-8)"></span></td><td class="num"><span class="skel" style="width: var(--nm-space-6)"></span></td><td><span class="skel" style="width: calc(var(--nm-space-12) * 2)"></span></td><td><span class="t3">Waiting</span></td></tr>\n' for _ in range(4))
s = s[: rows.start(1)] + "<tbody>\n" + first_three + skel + s[rows.start(3):]
s = s.replace('<span class="dense t3">2026-01-01 · 15 series · 1 selected</span>', '<span class="dense t3">2026-01-01 · importing · 3 series read</span>')
s = s.replace('<td class="num">15</td><td class="num">1 849</td>', '<td class="num">3</td><td class="num">412</td>')
s = sub(s, r'      <div class="lx" role="listbox" aria-label="Packages">.*?\n      </div>\n    </div>\n    <div class="panel__foot">.*?</div>', '''      <div class="empty" style="padding: var(--nm-space-8) var(--nm-panel-padding)"><svg class="ic"><use href="#i-jobs"/></svg><span>Waiting for import and pre-processing to finish.</span></div>
    </div>''')
s = s.replace('<span class="dense t3">DSC perf SNR50</span>', '<span class="dense t3">DSC perf SNR20</span>')
s = s.replace("<!-- gen:statusbar-dir -->", "<!-- gen:statusbar-import -->").replace("<!-- /gen:statusbar-dir -->", "<!-- /gen:statusbar-import -->")
(S / "18-directory-loading-error.html").write_text(s, encoding="utf-8", newline="\n")

# ── 18 DSC, computing (method changed, results stale) ─────────────────────────
s = re.sub(r"<!-- Icon sprite.*?</svg>\n", "<!-- gen:sprite -->\n<!-- /gen:sprite -->\n", d03, count=1, flags=re.S)
s = re.sub(r"  <!-- =+ Context menu.*?\n  </div>\n(?=\n</div>\n</body>)", "", s, flags=re.S)
s = s.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", "<title>NeuroMR-PRO · DSC Neuro Perfusion (computing)</title>")
s = s.replace('<button class="seg__item" role="radio">Gamma variate</button>\n                <button class="seg__item is-selected" role="radio" aria-checked="true">Model-free</button>', '<button class="seg__item is-selected" role="radio" aria-checked="true">Gamma variate</button>\n                <button class="seg__item" role="radio">Model-free</button>')
s = sub(s, r'<div class="vp__stage">\n          <img src="../assets/img/dsc_relcbv.png".*?</svg>\n        </div>', '''<div class="vp__state" data-od-id="maps-computing">
          <div class="empty">
            <span class="empty__title">Computing gamma-variate maps</span>
            <span class="progress"><span class="progress__bar" style="--v: 45%"></span><span class="progress__pct">45 %</span><span class="t2">slice 2 of 4 · about 6 s left</span></span>
            <button class="btn btn--secondary btn--dense">Cancel <span class="kbd">Esc</span></button>
            <span class="field__hint">You can keep drawing ROIs; results update when the maps are ready.</span>
          </div>
        </div>''')
s = s.replace('<span class="t2">Model-free · Stroke LUT · Slice 3/4</span>', '<span class="t2">Gamma variate · computing</span>')
s = sub(s, r'\n        <div class="cbar" style="--lut: var\(--nm-lut-stroke\)" data-od-id="colorbar-relcbv">.*?\n        </div>', "")  # no colour bar without a map
s = s.replace('<div class="ov ov--bl">Window 0–12 <span class="t2">ml/100 g</span><br><span class="t2">Opacity 100 %</span></div>', '<div class="ov ov--bl">Window 0–12 <span class="t2">ml/100 g</span> · applies when ready</div>')
s = s.replace('''        <div class="tbl-head">
          <h3 data-od-id="region-parameters-title">Region parameters</h3>''', '''        <div class="stale-bar" role="status" data-od-id="stale-results" style="margin-bottom: var(--nm-space-2)"><svg class="ic ic--sm" style="color: var(--nm-color-warning)"><use href="#i-warn"/></svg><span>Stale — the method changed to Gamma variate. Values below are Model-free; export is blocked until maps finish.</span></div>
        <div class="tbl-head">
          <h3 data-od-id="region-parameters-title">Region parameters</h3>''')
s = s.replace('''<span class="sb-item"><svg class="ic"><use href="#i-jobs"/></svg>Jobs <b>0 running</b></span>
    <span class="sb-sep"></span>
    <span class="sb-item"><span class="dot dot--success"></span><b>Maps up to date</b></span>''', '''<span class="sb-item"><svg class="ic"><use href="#i-jobs"/></svg>Jobs <b>1 running</b></span>
    <span class="sb-sep"></span>
    <span class="sb-item"><span class="progress"><span class="progress__bar" style="--v: 45%"></span><span class="progress__pct">45 %</span></span> Gamma-variate maps <button class="link">Cancel</button></span>''')
(S / "18-dsc-computing.html").write_text(s, encoding="utf-8", newline="\n")

# ── 18 Mismatch, invalid input + job error ────────────────────────────────────
s = strip_gen(d05)
s = s.replace("Diffusion–Perfusion Mismatch (2×2)</title>", "Diffusion–Perfusion Mismatch (invalid input, error)</title>")
s = sub(s, r'''              <label class="field">
                <span class="field__label">ADC below</span>
                <span class="input input--num input--dense"><span class="input__value">620</span>''', '''              <label class="field">
                <span class="field__label">ADC below</span>
                <span class="input input--num input--dense is-error" aria-invalid="true"><span class="input__value">6200</span>''')
s = sub(s, r'''            <div class="psec__row">
              <button class="btn btn--secondary btn--dense" data-od-id="mm-resegment">''', '''            <span class="field__error" role="alert">ADC threshold must be 100–1500 ×10⁻⁶ mm²/s; 6200 looks like a missing decimal.</span>
            <div class="psec__row">
              <button class="btn btn--secondary btn--dense" disabled data-od-id="mm-resegment">''')
s = sub(s, r'''            <div class="notice notice--warning" role="note" data-od-id="mm-012">''', '''            <div class="notice notice--critical" role="alert" data-od-id="job-error"><svg class="ic"><use href="#i-warn"/></svg><span class="notice__text">The last re-segmentation stopped: the engine restarted during the job — <button class="link dense">retry</button> or <button class="link dense">collect diagnostics</button>.</span></div>
            <div class="notice notice--warning" role="note" data-od-id="mm-012">''')
s = s.replace('''        <div class="tbl-head">
          <h3>Regions</h3>''', '''        <div class="stale-bar" role="status" style="margin-bottom: var(--nm-space-2)"><svg class="ic ic--sm" style="color: var(--nm-color-warning)"><use href="#i-warn"/></svg><span>Stale — thresholds changed and re-segmentation did not finish. Export is blocked.</span></div>
        <div class="tbl-head">
          <h3>Regions</h3>''')
s = s.replace('''<span class="sb-item"><span class="dot dot--success"></span><b>Segmentation up to date</b></span>''', '''<span class="sb-item"><span class="dot dot--critical"></span><b>Re-segment failed</b> · results stale</span>''')
(S / "18-mismatch-error-invalid.html").write_text(s, encoding="utf-8", newline="\n")
print("ok")
