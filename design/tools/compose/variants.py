"""Compose batch 8 variants: laptop DSC workspace (1920×1080 at 150 %, CSS 1280×720) with the task panel
collapsed and as an overlay."""
import re
from pathlib import Path

S = Path("design/screens")


def sub(s: str, pattern: str, repl: str, count: int = 1) -> str:
    out, n = re.subn(pattern, lambda m: repl, s, count=count, flags=re.S)
    assert n >= 1, pattern[:70]
    return out


# ── 24 Laptop DSC ─────────────────────────────────────────────────────────────
base = (S / "03-dsc-perfusion.html").read_text(encoding="utf-8")
base = re.sub(r"<!-- Icon sprite.*?</svg>\n", "<!-- gen:sprite -->\n<!-- /gen:sprite -->\n", base, count=1, flags=re.S)
base = re.sub(r"  <!-- =+ Context menu.*?\n  </div>\n(?=\n</div>\n</body>)", "", base, flags=re.S)
s = base.replace('<meta name="viewport" content="width=1920, height=1080">', '<meta name="viewport" content="width=1280, height=720">\n<meta name="nm-viewport" content="1280x720@1.5">')
s = s.replace('<div class="app">', '<div class="app app--laptop">', 1)
# banner keeps SAFE-001 fields (name, ID, sex, age, study date); modality and accession move to the tooltip
s = sub(s, r'\n      <span class="bf"><span class="bf__k">Modality</span>.*?</span></span>\n      <span class="bf"><span class="bf__k">Acc</span>.*?</span></span>', "")
s = s.replace('<span class="bf__k">(DOB 1970-01-01)</span>', "")
s = s.replace('<span class="bf"><span class="bf__k">Search studies', '<span class="bf"><span class="bf__k">Search studies')
# toolbar: panel toggle first, icon-only outputs, role pager for the four viewport roles
s = s.replace('<div class="toolbar" role="toolbar" aria-label="Viewer tools" data-od-id="toolbar">\n', '<div class="toolbar" role="toolbar" aria-label="Viewer tools" data-od-id="toolbar">\n    <button class="ibtn" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel"><svg class="ic"><use href="#i-collapse"/></svg></button>\n    <span class="tb-sep"></span>\n', 1)
s = sub(s, r'    <button class="ibtn" aria-label="Draw ROI: spline \(C\)">.*?</button>\n', "")
s = sub(s, r'    <button class="ibtn" aria-label="Draw ROI: freehand \(F\)">.*?</button>\n', "")
s = sub(s, r'\n      <span class="tip tip--below" role="tooltip">Mirror line <span class="kbd">L</span></span>', "")
s = sub(s, r'    <button class="picker" aria-label="Layout 2×2 \(Ctrl\+L\)".*?</button>', '''    <div class="seg" role="radiogroup" aria-label="Viewport roles (F6)" style="width: calc(var(--nm-space-12) * 4.5)" data-od-id="role-pager">
      <button class="seg__item is-selected" role="radio" aria-checked="true">1·2 Source · Maps</button>
      <button class="seg__item" role="radio">3·4 Table · Graph</button>
    </div>
    <span class="kbd">F6</span>''')
s = sub(s, r'    <button class="ibtn" aria-label="Bookmarks \(B\)">.*?</button>\n', "")
s = sub(s, r'    <button class="btn btn--secondary btn--dense" data-od-id="tb-generate-series">.*?</button>', '    <button class="ibtn" aria-label="Generate series (Ctrl+G)"><svg class="ic"><use href="#i-series"/></svg></button>')
s = sub(s, r'    <button class="btn btn--secondary btn--dense" data-od-id="tb-save-tables">.*?</button>', '    <button class="ibtn" aria-label="Save tables (Ctrl+S)"><svg class="ic"><use href="#i-table-save"/></svg></button>')
s = sub(s, r'    <button class="btn btn--ghost btn--dense" data-od-id="tb-report">.*?</button>', '    <button class="ibtn" aria-label="Report (Ctrl+P)"><svg class="ic"><use href="#i-reports"/></svg></button>')
# 1×2: keep viewports 1 and 2, drop 3 and 4 (reachable with F6)
s = sub(s, r'\n    <!-- VP3 · Table ↔ Anatomical -->.*?(?=\n  </main>)', "")
s = s.replace('<main class="vgrid" aria-label="Viewports" data-od-id="viewport-grid">', '<main class="vgrid vgrid--1x2" aria-label="Viewports" data-od-id="viewport-grid">')
s = s.replace('<div class="vp__body">\n        <div class="vp__stage">', '<div class="vp__body vp__body--fit">\n        <div class="vp__stage">')
# no inspector column on the laptop tier
s = sub(s, r'\n  <!-- =+ Inspector \(280, open\) =+ -->.*?</aside>\n', "\n")
# battery notice in the status bar (brief §12.2)
s = sub(s, r'<span class="sb-item">Licence <b>active</b></span>', '<span class="sb-item"><span class="dot dot--warning"></span>On battery — long computations run slower</span>')
s = sub(s, r'    <span class="sb-item"><svg class="ic"><use href="#i-display"/></svg><b>Diagnostic display</b></span>\n    <span class="sb-sep"></span>\n', "")
collapsed = s.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", "<title>NeuroMR-PRO · DSC Neuro Perfusion (laptop)</title>")
(S / "24-laptop-dsc.html").write_text(collapsed, encoding="utf-8", newline="\n")
overlay = s.replace("<title>NeuroMR-PRO · DSC Neuro Perfusion</title>", "<title>NeuroMR-PRO · DSC Neuro Perfusion (laptop, task panel open)</title>")
overlay = overlay.replace('<aside class="panel" aria-label="Task guidance" data-od-id="task-panel">', '<aside class="panel panel--overlay" aria-label="Task guidance" data-od-id="task-panel">')
overlay = overlay.replace('<button class="ibtn" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel">', '<button class="ibtn is-active" aria-pressed="true" aria-label="Task guidance (Ctrl+B)" data-od-id="tb-panel">')
(S / "24-laptop-dsc-panel.html").write_text(overlay, encoding="utf-8", newline="\n")
print("ok")
