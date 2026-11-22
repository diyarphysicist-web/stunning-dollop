"""Build the clickable prototype in design/prototype/ from the Phase 1 screens (no new visuals).

Each design/screens/<id>.html is copied to design/prototype/<id>.html with proto.css and proto.js
attached; index.html is the sign-in screen. The shortcut sheet (from 17-shortcuts) is embedded in
every page as a template so ? opens it over the current screen; the lesion properties dialog (from
13-longitudinal) is embedded in 13-longitudinal-compare. proto.js holds the routes; this script checks
that every screen id it names exists. Run from the repository root after changing any screen:

    python design/tools/compose/prototype.py
"""
import re
from pathlib import Path

S = Path("design/screens")
P = Path("design/prototype")


def block(html: str, start_marker: str) -> str:
    """Return the balanced <div> element that starts at start_marker."""
    i = html.index(start_marker)
    depth = 0
    for m in re.finditer(r"<div\b|</div>", html[i:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return html[i : i + m.end()]
    raise ValueError(start_marker)


screens = []
for f in sorted(S.glob("*.html")):
    if f.name == "index.html":
        continue
    title = re.search(r"<title>NeuroMR-PRO · ([^<]*)</title>", f.read_text(encoding="utf-8")).group(1)
    screens.append((f.stem, title.replace("&amp;", "&")))
ids = {s for s, _ in screens}

shortcut_sheet = block((S / "17-shortcuts.html").read_text(encoding="utf-8"), '<div class="scrim" data-od-id="shortcut-sheet">')
lesion_props = block((S / "13-longitudinal.html").read_text(encoding="utf-8"), '<div class="popover" style="right: var(--nm-space-2)')
assert 'data-od-id="lesion-properties"' in lesion_props

for stale in P.glob("*.html"):
    stale.unlink()
for sid, _ in screens:
    html = (S / f"{sid}.html").read_text(encoding="utf-8")
    assert html.count('href="shell.css"') == 1 and 'id="i-check"' in html, sid
    html = html.replace('href="shell.css"', 'href="../screens/shell.css"')
    html = html.replace(
        "<!DOCTYPE html>",
        f"<!DOCTYPE html>\n<!-- Prototype page built from design/screens/{sid}.html by design/tools/compose/prototype.py. Edit the screen, then rebuild. -->",
        1,
    )
    html = html.replace("</head>", '<link rel="stylesheet" href="proto.css">\n</head>', 1)
    templates = []
    if sid != "17-shortcuts":
        templates.append(f'<template id="nm-dlg-shortcut-sheet">{shortcut_sheet}</template>')
    if sid == "13-longitudinal-compare":
        templates.append(f'<template id="nm-dlg-lesion-properties">{lesion_props}</template>')
    tail = "\n".join(templates + ['<script src="screens.js"></script>', '<script src="proto.js"></script>'])
    assert html.count("</body>") == 1, sid
    html = html.replace("</body>", f"{tail}\n</body>")
    (P / f"{sid}.html").write_text(html, encoding="utf-8", newline="\n")
    if sid == "19-sign-in":
        (P / "index.html").write_text(html, encoding="utf-8", newline="\n")

rows = ",\n".join(f'  ["{sid}", "{title}"]' for sid, title in screens)
(P / "screens.js").write_text(
    "// Built by design/tools/compose/prototype.py: every screen, in number order.\n"
    f"window.NM_SCREENS = [\n{rows},\n];\n",
    encoding="utf-8",
    newline="\n",
)

named = set(re.findall(r'"(\d\d-[a-z0-9-]+)"', (P / "proto.js").read_text(encoding="utf-8")))
missing = sorted(named - ids)
assert not missing, f"proto.js names screens that do not exist: {missing}"

print(f"prototype: {len(screens)} screens + index.html; {len(named)} screen ids in proto.js routes all exist")
