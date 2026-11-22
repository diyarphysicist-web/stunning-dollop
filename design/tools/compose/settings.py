"""Compose batch 6 Settings pages (17-settings-defaults, 17-settings-display)."""
from pathlib import Path

S = Path("design/screens")

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>NeuroMR-PRO · {title}</title>
<meta name="viewport" content="width=1920, height=1080">
<link rel="stylesheet" href="../assets/tokens.css">
<link rel="stylesheet" href="../assets/luts.css">
<link rel="stylesheet" href="shell.css">
</head>
<body>

<!-- gen:sprite -->
<!-- /gen:sprite -->

<!-- {comment} -->
<div class="app app--settings">
  <!-- gen:topbar -->
  <!-- /gen:topbar -->
  <!-- gen:rail-settings -->
  <!-- /gen:rail-settings -->
  <div class="toolbar" role="toolbar" aria-label="Settings" data-od-id="toolbar">
    <span class="panel__title" style="padding-left: var(--nm-space-2)">Settings</span>
    <span class="tb-sep"></span>
    <div class="search"><svg class="ic"><use href="#i-search"/></svg><span>Search settings</span></div>
    <span class="spacer"></span>
    <span class="dense t3">{scope}</span>
  </div>
  <main class="settings" aria-label="Settings">
    <nav class="snav" aria-label="Settings sections">
{nav}
    </nav>
    <div class="scontent">
{content}
    </div>
  </main>
  <!-- gen:statusbar-settings -->
  <!-- /gen:statusbar-settings -->
</div>
</body>
</html>
"""

SECTIONS = [
    ("Workstation", [("General", "settings"), ("Displays and calibration", "display"), ("Hanging protocols", "layout")]),
    ("Analysis", [("LUT and window defaults", "wl"), ("Smoothing defaults", "mask"), ("Injection presets", "series"), ("Data types", "jobs")]),
    ("Site", [("Network and PACS", "engine"), ("Users and roles", "user"), ("Licence", "lock"), ("System", "display"), ("Audit log", "reports")]),
]


def nav(selected: str) -> str:
    out = []
    for group, items in SECTIONS:
        out.append(f'      <span class="eyebrow snav__h">{group}</span>')
        for name, icon in items:
            sel = " is-selected" if name == selected else ""
            cur = ' aria-current="page"' if sel else ""
            out.append(f'      <a class="snav__i{sel}"{cur}><svg class="ic"><use href="#i-{icon}"/></svg>{name}</a>')
    return "\n".join(out)


def card(title: str, body: str, actions: str = "") -> str:
    return f'''      <section class="scard">
        <div class="scard__head"><h2>{title}</h2><span class="spacer"></span>{actions}</div>
        <div class="scard__body">
{body}
        </div>
      </section>'''


def main() -> None:
    luts = [
        ("relCBV · Manual AIF", "stroke", "Stroke", "0 – 8", "ml/100 g"), ("relCBV · other methods", "stroke", "Stroke", "0 – 99th percentile", "a.u."),
        ("relCBF · Manual AIF", "stroke", "Stroke", "0 – 80", "ml/100 g/min"), ("relCBF · other methods", "stroke", "Stroke", "0 – 99th percentile", "a.u."),
        ("MTT", "blueToRed", "Blue-to-Red", "0 – 14", "s"), ("TTP", "blueToRed", "Blue-to-Red", "10 – 40", "s"),
        ("Tmax / Delay", "stroke", "Stroke", "0 – 12", "s"), ("Ktrans", "stroke", "Stroke", "0 – 0.30", "min⁻¹"),
        ("FA", "gray", "Gray", "0 – 1", "unitless"), ("ADC", "gray", "Gray", "0 – 3000", "×10⁻⁶ mm²/s"),
        ("T-score", "hot", "Hot", "3.1 – 12.0", "T"), ("Change map", "blueToRed", "Red–blue", "symmetric, 2 % outliers", "a.u."),
    ]
    lut_rows = "".join(
        f'<tr><td class="strong">{m}</td><td><span class="lutbar" style="--lut: var(--nm-lut-{k}-h)"></span> {n}</td><td class="num">{w}</td><td>{u}</td></tr>'
        for m, k, n, w, u in luts
    )
    defaults = "\n".join([
        card("LUT and window defaults", f'''          <table class="tbl tbl--dense">
                <colgroup><col style="width:20%"><col style="width:30%"><col><col style="width:20%"></colgroup>
                <thead><tr><th>Map</th><th>LUT</th><th class="num">Default window</th><th>Unit</th></tr></thead>
                <tbody>{lut_rows}</tbody>
              </table>
              <span class="field__hint">Site defaults; a user can change a map's LUT and window in the viewport, and the change is kept in the session and bookmarks.</span>''',
             '<span class="chip">Site</span><button class="btn btn--secondary btn--dense">Edit</button>'),
        card("Smoothing defaults", '''          <div class="grid3">
                <div class="field"><span class="field__label">Spatial</span><div class="seg"><button class="seg__item is-selected">None</button><button class="seg__item">Weak</button><button class="seg__item">Medium</button><button class="seg__item">Strong</button></div></div>
                <div class="field"><span class="field__label">Temporal</span><div class="seg"><button class="seg__item is-selected">None</button><button class="seg__item">Weak</button><button class="seg__item">Medium</button><button class="seg__item">Strong</button></div></div>
                <label class="field"><span class="field__label">fMRI smoothing width</span><span class="input input--num input--dense"><span class="input__value">2 ×</span><span class="input__suffix">in-plane voxel</span></span></label>
              </div>
              <span class="field__hint">Smoothing changes numerical results; results computed with non-default smoothing are flagged in tables, exports and reports.</span>'''),
        card("Injection presets", '''          <table class="tbl tbl--dense">
                <colgroup><col style="width:30%"><col><col><col><col><col style="width:16%"></colgroup>
                <thead><tr><th>Preset</th><th class="num">Relaxivity r₁<span class="unit">[s⁻¹·mM⁻¹]</span></th><th class="num">Dose<span class="unit">[mmol/kg]</span></th><th>Duration</th><th class="num">Hct<span class="unit">[%]</span></th><th>Scope</th></tr></thead>
                <tbody><tr class="is-selected"><td class="strong">Example · Gd 0.1 mmol/kg · medium</td><td class="num">4.5</td><td class="num">0.1</td><td>Medium 5–10 s</td><td class="num">45</td><td><span class="chip chip--warning">Example</span></td></tr></tbody>
              </table>
              <div class="notice notice--warning" role="note"><svg class="ic"><use href="#i-warn"/></svg><span class="notice__text">The shipped preset is an example — create your site's presets from the contrast agent's labelling and delete the example.</span></div>''',
             '<button class="btn btn--secondary btn--dense">New preset…</button><button class="btn btn--ghost btn--dense">Edit</button><button class="btn btn--destructive btn--dense">Delete</button>'),
        card("Data types", '''          <table class="tbl tbl--dense">
                <colgroup><col style="width:34%"><col><col style="width:18%"></colgroup>
                <thead><tr><th>Series description</th><th>Data type</th><th>Scope</th></tr></thead>
                <tbody>
                  <tr><td class="mono">3D FLAIR</td><td>FLAIR</td><td>Site</td></tr>
                  <tr><td class="mono">DTI 32dir</td><td>DWI</td><td>Site</td></tr>
                  <tr><td class="mono">T1 FFE VFA *deg</td><td>T1</td><td>Site</td></tr>
                  <tr><td class="mono">DWI IVIM DKI</td><td>DWI</td><td>User</td></tr>
                </tbody>
              </table>
              <span class="field__hint">New descriptions map automatically on future loads. Site types need the administrator role to change.</span>''',
             '<button class="btn btn--secondary btn--dense">New type…</button>'),
    ])
    (S / "17-settings-defaults.html").write_text(HEAD.format(
        title="Settings · Analysis defaults", comment="Settings, Analysis section: LUT and window defaults, smoothing defaults, injection presets (PERM-006), data types (LBA-003).",
        scope="Site settings · administrator", nav=nav("LUT and window defaults"), content=defaults), encoding="utf-8", newline="\n")

    display = "\n".join([
        card("Displays", '''          <table class="tbl">
                <colgroup><col style="width:30%"><col><col><col><col style="width:18%"></colgroup>
                <thead><tr><th>Display</th><th>Resolution</th><th class="num">Scale</th><th>Role</th><th>Calibration check</th></tr></thead>
                <tbody>
                  <tr class="is-selected"><td class="strong">Display 1 · primary</td><td>2560 × 1440</td><td class="num">100 %</td><td>Diagnostic</td><td><span class="dot dot--idle" style="display: inline-block"></span> Not checked</td></tr>
                  <tr><td class="strong">Display 2</td><td>1920 × 1080</td><td class="num">125 %</td><td>Worklist and reports</td><td>Not required</td></tr>
                </tbody>
              </table>
              <span class="field__hint">Window roles and hanging protocols per monitor configuration are set in Hanging protocols.</span>''',
             '<button class="btn btn--secondary btn--dense">Identify displays</button>'),
        card("Interface scale", '''          <table class="tbl">
                <colgroup><col style="width:30%"><col style="width:16%"><col style="width:26%"><col></colgroup>
                <thead><tr><th>Display</th><th class="num">Windows scale</th><th>Interface scale</th><th>Workspace at this scale</th></tr></thead>
                <tbody>
                  <tr class="is-selected"><td class="strong">Display 1 · primary</td><td class="num">100 %</td>
                    <td><div class="seg" role="radiogroup" aria-label="Interface scale, display 1" data-ui-scale><button class="seg__item is-selected" role="radio" aria-checked="true">100 %</button><button class="seg__item" role="radio" aria-checked="false">125 %</button><button class="seg__item" role="radio" aria-checked="false">150 %</button></div></td>
                    <td>2560 × 1440 · full layout</td></tr>
                  <tr><td class="strong">Display 2</td><td class="num">125 %</td>
                    <td><div class="seg" role="radiogroup" aria-label="Interface scale, display 2"><button class="seg__item" role="radio" aria-checked="false">100 %</button><button class="seg__item is-selected" role="radio" aria-checked="true">125 %</button><button class="seg__item" role="radio" aria-checked="false">150 %</button></div></td>
                    <td>1229 × 691 · panels as overlays</td></tr>
                </tbody>
              </table>
              <span class="field__hint">Scales text, controls and overlays for this user; images keep the display's native pixels. Applies at once and is saved with your display profile.</span>'''),
        card("Calibration check · Display 1", '''          <div class="field">
                <span class="field__label">Grayscale ramp <span>0 – 255</span></span>
                <span class="lutbar lutbar--wide" style="--lut: var(--nm-lut-gray-h)"></span>
                <span class="field__hint">The ramp must look smooth from black to white with no bands; the test pattern adds low-contrast patches at both ends.</span>
              </div>
              <div class="grid3">
                <div class="kv"><dt>Last check</dt><dd>None recorded</dd></div>
                <div class="kv"><dt>Check interval</dt><dd>30<span class="u">days</span></dd></div>
                <div class="kv"><dt>Recorded by</dt><dd>Physicist / QA role</dd></div>
              </div>
              <div class="notice notice--info" role="note"><svg class="ic"><use href="#i-info"/></svg><span class="notice__text">This display has no recorded check — run the test pattern before reading on it.</span></div>
              <div class="psec__row"><button class="btn btn--primary btn--dense">Open test pattern <span class="kbd">Ctrl+Shift+T</span></button><button class="btn btn--ghost btn--dense">Check history</button></div>'''),
        card("Dark-room mode", '''          <div class="field field--row"><span class="dense">Dim chrome further in reading rooms <span class="t2">images are unchanged</span></span><span class="switch" role="switch" aria-checked="false"><span class="switch__track"></span></span></div>'''),
    ])
    (S / "17-settings-display.html").write_text(HEAD.format(
        title="Settings · Displays and calibration", comment="Settings, Workstation section: displays, interface scale (GEN-210), calibration check, dark-room mode.",
        scope="Workstation settings", nav=nav("Displays and calibration"), content=display), encoding="utf-8", newline="\n")
    print("ok")


if __name__ == "__main__":
    main()
