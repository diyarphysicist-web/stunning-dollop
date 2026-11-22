"""Write design/screens/index.html: every screen as a clickable thumbnail in number order, with its title.

Thumbnails are the 1920 × 1080 PNGs from `pnpm design:render`; each opens the HTML screen.
Run from the repository root after adding, renaming or re-titling a screen.
"""
import html
import re
from pathlib import Path

S = Path("design/screens")
items = []
for f in sorted(S.glob("*.html")):
    if f.name == "index.html":
        continue
    m = re.search(r"<title>NeuroMR-PRO · ([^<]*)</title>", f.read_text(encoding="utf-8"))
    assert m, f.name
    assert (S / f"{f.stem}.png").exists(), f"{f.stem}.png missing: run pnpm design:render"
    items.append((f.stem, f.stem.split("-")[0], html.unescape(m.group(1))))

cards = "\n".join(
    f'    <li><a class="g-card" href="{stem}.html"><img src="{stem}.png" alt="" loading="lazy" width="1920" height="1080">'
    f'<span class="g-cap"><span class="g-num">{num}</span>{html.escape(title)}</span></a></li>'
    for stem, num, title in items
)
page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NeuroMR-PRO · Screens</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="../assets/tokens.css">
<style>
  /* Screen index (built by design/tools/compose/gallery.py). Tokens only. */
  body {{ margin: 0; background: var(--nm-color-bg); color: var(--nm-color-text-primary); font-family: var(--nm-font-ui); font-size: var(--nm-font-size-base); line-height: var(--nm-line-height-base); }}
  .g-head {{ padding: var(--nm-space-8) var(--nm-space-8) var(--nm-space-4); }}
  .g-head h1 {{ margin: 0; font-size: var(--nm-font-size-display); line-height: var(--nm-line-height-display); font-weight: var(--nm-font-weight-semibold); }}
  .g-head p {{ margin: var(--nm-space-2) 0 0; color: var(--nm-color-text-secondary); }}
  .g-state {{ display: inline-block; margin-top: var(--nm-space-3); padding: var(--nm-space-1) var(--nm-space-2); border-radius: var(--nm-radius-md); background: var(--nm-color-warning-subtle); font-size: var(--nm-font-size-dense); }}
  .g-grid {{ list-style: none; margin: 0; padding: 0 var(--nm-space-8) var(--nm-space-8); display: grid; grid-template-columns: repeat(auto-fill, minmax(calc(var(--nm-space-12) * 6.5), 1fr)); gap: var(--nm-space-4); }}
  .g-card {{ display: block; background: var(--nm-color-surface); border: var(--nm-size-hairline) solid var(--nm-color-border); border-radius: var(--nm-radius-lg); overflow: hidden; color: inherit; text-decoration: none; }}
  .g-card:hover, .g-card:focus-visible {{ border-color: var(--nm-color-accent); outline: none; }}
  .g-card img {{ display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; object-position: top left; background: var(--nm-color-viewport); }}
  .g-cap {{ display: flex; gap: var(--nm-space-2); padding: var(--nm-space-2) var(--nm-space-3); }}
  .g-num {{ color: var(--nm-color-text-tertiary); font-variant-numeric: var(--nm-font-numeric); }}
</style>
</head>
<body>
<header class="g-head">
  <h1>NeuroMR-PRO screens</h1>
  <p>{len(items)} screens in number order. Click a thumbnail to open the HTML screen. Imagery comes from synthetic phantoms.</p>
  <span class="g-state">Design draft, awaiting approval</span>
</header>
<main>
  <ul class="g-grid">
{cards}
  </ul>
</main>
</body>
</html>
"""
(S / "index.html").write_text(page, encoding="utf-8", newline="\n")
print(f"index.html: {len(items)} screens")
