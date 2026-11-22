"""Compose batch 7 screens: sign-in, lock, role start view, multi-monitor, test pattern, licence,
system, audit log, collect diagnostics, PDF report previews (DSC, Mismatch)."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from settings import HEAD, card, nav  # noqa: E402

S = Path("design/screens")
DOC = """<!DOCTYPE html>
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
{body}
</body>
</html>
"""


def write(name: str, text: str) -> None:
    (S / f"{name}.html").write_text(text, encoding="utf-8", newline="\n")


def settings_page(name: str, title: str, comment: str, scope: str, selected: str, content: str, overlay: str = "", status: str = "settings") -> None:
    page = HEAD.format(title=title, comment=comment, scope=scope, nav=nav(selected), content=content)
    page = page.replace("<!-- gen:statusbar-settings -->", f"<!-- gen:statusbar-{status} -->").replace("<!-- /gen:statusbar-settings -->", f"<!-- /gen:statusbar-{status} -->")
    if overlay:
        page = page.replace("\n</div>\n</body>", f"\n{overlay}\n</div>\n</body>")
    write(name, page)


# ── 19 Sign-in ────────────────────────────────────────────────────────────────
write("19-sign-in", DOC.format(title="Sign in", comment="Sign-in (brief §12.4): Windows single sign-on, organisation account via the system browser, local account. No patient data before sign-in.", body='''<main class="gate" aria-label="Sign in">
  <div class="gate__card" data-od-id="sign-in">
    <div class="gate__brand"><svg class="ic"><use href="#i-brand"/></svg>NeuroMR-PRO</div>
    <p class="t2">Sign in to open studies on this workstation.</p>
    <button class="btn btn--primary btn--block">Continue as WS-NEURO-03\\dr.neuro <span class="kbd">Enter</span></button>
    <span class="field__hint">Windows account · single sign-on</span>
    <button class="btn btn--secondary btn--block">Sign in with organisation account</button>
    <span class="field__hint">Opens the system browser for your identity provider.</span>
    <div class="divider">or local account</div>
    <label class="field"><span class="field__label">User name</span><span class="input"><span class="input__value t3">User name</span></span></label>
    <label class="field"><span class="field__label">Password</span><span class="input"><span class="input__value t3">Password</span><svg class="ic ic--sm"><use href="#i-lock"/></svg></span></label>
    <button class="btn btn--ghost btn--block">Sign in with local account</button>
  </div>
  <div class="gate__foot"><span>Workstation WS-NEURO-03</span><span>Offline-capable · no internet needed</span><span>Language: English</span><button class="link dense">Accessibility</button></div>
</main>'''))

# ── 19 Lock ───────────────────────────────────────────────────────────────────
write("19-lock", DOC.format(title="Locked", comment="Lock screen (brief §12.4): auto-lock after 15 min idle; no patient information is shown; unlocking restores the session exactly.", body='''<main class="gate" aria-label="Session locked">
  <div class="gate__card" data-od-id="lock">
    <div class="gate__brand"><svg class="ic"><use href="#i-lock"/></svg>Session locked</div>
    <p class="t2">Locked at 14:32 after 15 minutes without input. Patient information is hidden until you unlock.</p>
    <dl>
      <div class="kv"><dt>Signed in</dt><dd>dr.neuro · Neurologist</dd></div>
      <div class="kv"><dt>Session</dt><dd>1 study open · autosaved 14:31</dd></div>
    </dl>
    <label class="field"><span class="field__label">Password</span><span class="input is-focus"><span class="input__value t3">Password</span><svg class="ic ic--sm"><use href="#i-lock"/></svg></span></label>
    <button class="btn btn--primary btn--block">Unlock <span class="kbd">Enter</span></button>
    <button class="btn btn--ghost btn--block">Switch user</button>
    <span class="field__hint">Switching user closes this session; its state is kept and reopens for dr.neuro.</span>
  </div>
  <div class="gate__foot"><span>NeuroMR-PRO</span><span>Workstation WS-NEURO-03</span></div>
</main>'''))

# ── 19 Role-based start view (Neurologist) ────────────────────────────────────
start = '''<div class="app app--settings">
  <!-- gen:topbar-none -->
  <!-- /gen:topbar-none -->
  <!-- gen:rail-directory -->
  <!-- /gen:rail-directory -->
  <div class="toolbar" role="toolbar" aria-label="Start" data-od-id="toolbar">
    <span class="panel__title" style="padding-left: var(--nm-space-2)">Start</span>
    <span class="chip">Neurologist</span>
    <span class="dense t3">Start view: Mismatch and Longitudinal · set by role</span>
    <span class="spacer"></span>
    <button class="btn btn--ghost btn--dense">Open Directory <span class="kbd">Ctrl+1</span></button>
  </div>
  <main class="start" aria-label="Start view" data-od-id="start-view">
''' + card("Stroke · mismatch ready", '''          <table class="tbl">
            <colgroup><col style="width:28%"><col style="width:16%"><col><col style="width:14%"></colgroup>
            <thead><tr><th>Patient</th><th>Study</th><th>Result (pre-processed)</th><th></th></tr></thead>
            <tbody>
              <tr class="is-selected"><td class="strong mono">PHANTOM^SYNTHETIC</td><td>2026-01-01</td><td>Perfusion 6.7 ml · diffusion 1.9 ml · mismatch 4.8 ml <span class="chip chip--warning">Not reviewed</span></td><td><button class="btn btn--primary btn--dense">Open <span class="kbd">Enter</span></button></td></tr>
            </tbody>
          </table>
          <span class="field__hint">Pre-processed in the background; open the case to review registration and segmentation before using the values.</span>''') + "\n" + card("Follow-up · comparison ready", '''          <table class="tbl">
            <colgroup><col style="width:28%"><col style="width:26%"><col><col style="width:14%"></colgroup>
            <thead><tr><th>Patient</th><th>Studies</th><th>Findings</th><th></th></tr></thead>
            <tbody>
              <tr><td class="strong mono">PHANTOM^SYNTHETIC</td><td>2026-01-01 → 2026-07-01</td><td>5 · 1 new · total +7.2 %</td><td><button class="btn btn--secondary btn--dense">Open</button></td></tr>
            </tbody>
          </table>
          <span class="field__hint">Registration ran automatically; check every propagated lesion before reporting.</span>''') + "\n" + card("Recently opened", '''          <dl>
            <div class="kv"><dt>PHANTOM^SYNTHETIC · DSC Neuro Perfusion</dt><dd>today 14:05</dd></div>
            <div class="kv"><dt>PHANTOM^SYNTHETIC · Longitudinal Brain Analysis</dt><dd>today 11:40</dd></div>
          </dl>''') + "\n" + card("Workstation", '''          <dl>
            <div class="kv"><dt>Display</dt><dd>Diagnostic display · calibration check due</dd></div>
            <div class="kv"><dt>Licence</dt><dd>Spectroscopy trial ends 2026-12-13</dd></div>
            <div class="kv"><dt>Engine</dt><dd>Local · ready</dd></div>
          </dl>''') + '''
  </main>
  <!-- gen:statusbar-idle -->
  <!-- /gen:statusbar-idle -->
</div>'''
write("19-start-neurologist", DOC.format(title="Start · Neurologist", comment="Role-based start view (brief §12.4): neurologists start with Mismatch and Longitudinal work ready from background pre-processing.", body=start))

# ── 20 Multi-monitor setup (Settings → Hanging protocols) ─────────────────────
mm = "\n".join([
    card("Display configuration", '''          <div class="monitors" aria-label="Display arrangement">
            <div class="mon is-selected"><div class="mon__screen" style="width: calc(var(--nm-space-12) * 6); height: calc(var(--nm-space-12) * 3.4)"><b>Display 1</b><br>2560 × 1440 · 100 %<br><span class="chip chip--accent">Diagnostic</span><br>Main</div><span class="mon__stand"></span></div>
            <div class="mon"><div class="mon__screen" style="width: calc(var(--nm-space-12) * 4.5); height: calc(var(--nm-space-12) * 2.5)"><b>Display 2</b><br>1920 × 1080 · 125 %<br>Reference</div><span class="mon__stand"></span></div>
          </div>
          <dl>
            <div class="kv"><dt>Configuration</dt><dd class="mono">2 displays · 2560×1440 + 1920×1080 · side by side</dd></div>
            <div class="kv"><dt>Saved placements</dt><dd>Restored on reconnect · undocking moves windows without losing state</dd></div>
          </dl>''', '<button class="btn btn--secondary btn--dense">Identify displays</button>'),
    card("Window roles", '''          <table class="tbl tbl--dense">
            <colgroup><col style="width:22%"><col style="width:24%"><col></colgroup>
            <thead><tr><th>Display</th><th>Role</th><th>Content</th></tr></thead>
            <tbody>
              <tr class="is-selected"><td>Display 1 · diagnostic</td><td>Main</td><td>Workspace: task guidance, toolbar, viewport grid</td></tr>
              <tr><td>Display 2</td><td>Reference</td><td>Series browser, result tables and graphs, report preview</td></tr>
            </tbody>
          </table>
          <span class="field__hint">One window per display; series, viewports and graphs drag between windows; scroll, zoom, windowing and crosshair stay linked.</span>'''),
    card("Hanging protocols", '''          <table class="tbl tbl--dense">
            <colgroup><col style="width:30%"><col><col style="width:18%"></colgroup>
            <thead><tr><th>Protocol</th><th>Applies when</th><th>Scope</th></tr></thead>
            <tbody>
              <tr class="is-selected"><td class="strong">Maps on diagnostic, graphs on colour</td><td>2 displays · one marked diagnostic</td><td>Site</td></tr>
              <tr><td class="strong">Portrait 5MP stacked</td><td>1 display · portrait 2048×2560</td><td>Site</td></tr>
              <tr><td class="strong">Single 4K 2×2</td><td>1 display · ≥ 3840 wide</td><td>Factory</td></tr>
              <tr><td class="strong">Laptop 1×2</td><td>1 display · below 1600 px wide</td><td>Factory</td></tr>
            </tbody>
          </table>
          <div class="grid2">
            <div class="field"><span class="field__label">Display 1 · Main</span><span class="dense">2×2 · source, live maps, table, graph</span></div>
            <div class="field"><span class="field__label">Display 2 · Reference</span><span class="dense">Tables and graphs · report preview</span></div>
          </div>''', '<button class="btn btn--secondary btn--dense">New protocol…</button><button class="btn btn--ghost btn--dense">Edit</button>'),
])
settings_page("20-multi-monitor", "Settings · Hanging protocols", "Multi-monitor setup (brief §12.3): display list with diagnostic flag, window roles, hanging protocols by monitor configuration.", "Workstation settings", "Hanging protocols", mm)

# ── 20 Display test pattern (full window on the display under test) ───────────
write("20-test-pattern", DOC.format(title="Display test pattern", comment="Display test pattern (brief §12.3): original design, 8-bit, pixel exact; opened from Settings → Displays and calibration.", body='''<div class="app" style="display: block">
  <header class="topbar" data-od-id="pattern-bar">
    <div class="brand"><svg class="ic brand__mark"><use href="#i-display"/></svg>Display test pattern</div>
    <span class="dense">Display 1 · 2560 × 1440 · 100 %</span>
    <span class="dense t2">Check: 18 distinct steps · patches at 5 % and 95 % visible · 1-px bars resolved · no banding in the ramp</span>
    <div class="topbar__actions" style="padding-right: var(--nm-space-2)">
      <button class="btn btn--secondary btn--dense">Record result…</button>
      <button class="btn btn--ghost btn--dense">Close <span class="kbd">Esc</span></button>
    </div>
  </header>
  <div class="pattern" aria-label="Test pattern"><img src="../assets/img/test_pattern.png" width="1920" height="1000" alt="Grayscale steps, ramp, low-contrast patches, resolution bars and grid"></div>
</div>'''))

# ── 21 Licence ────────────────────────────────────────────────────────────────
mods = [
    ("Core", "Directory, Viewer, Subtraction, Echo Accumulation, reports", "success", "Active", "2027-06-30"),
    ("Perfusion", "DSC, DCE / T1, Permeability", "success", "Active", "2027-06-30"),
    ("Diffusion", "Diffusion, Advanced Diffusion", "success", "Active", "2027-06-30"),
    ("Stroke", "Diffusion–Perfusion Mismatch · needs Perfusion + Diffusion", "success", "Active", "2027-06-30"),
    ("Neurosurgery", "Tractography, Brain Function", "success", "Active", "2027-06-30"),
    ("Spectroscopy", "Spectroscopy", "warning", "Trial · 21 days left", "2026-12-13"),
    ("Follow-up", "Longitudinal Brain Analysis, change map, FLAIR*", "success", "Active", "2027-06-30"),
]
mod_rows = "".join(f'<tr><td class="strong">{m}</td><td class="t2">{c}</td><td><span class="dot dot--{d}" style="display: inline-block"></span> {s}</td><td class="num">{e}</td></tr>' for m, c, d, s, e in mods)
lic = "\n".join([
    card("Licence", '''          <div class="grid3">
            <div class="kv"><dt>Type</dt><dd>Node-locked subscription</dd></div>
            <div class="kv"><dt>Licence ID</dt><dd class="mono">NMR-7F3A-21C9</dd></div>
            <div class="kv"><dt>Expires</dt><dd>2027-06-30</dd></div>
            <div class="kv"><dt>Hardware fingerprint</dt><dd class="mono">4 of 5 components match</dd></div>
            <div class="kv"><dt>Signature</dt><dd>Valid · Ed25519</dd></div>
            <div class="kv"><dt>Checked</dt><dd>today 09:02</dd></div>
          </div>
          <span class="field__hint">After expiry, existing results stay viewable, reportable and exportable; only new analyses stop.</span>'''),
    card("Modules", f'''          <table class="tbl">
            <colgroup><col style="width:16%"><col><col style="width:20%"><col style="width:14%"></colgroup>
            <thead><tr><th>Module</th><th>Contents</th><th>Status</th><th class="num">Until</th></tr></thead>
            <tbody>{mod_rows}</tbody>
          </table>
          <div class="notice notice--warning" role="note"><svg class="ic"><use href="#i-warn"/></svg><span class="notice__text">The Spectroscopy trial ends on 2026-12-13 — load a licence file before then to keep starting new spectroscopy analyses.</span></div>'''),
    card("Offline activation", '''          <div class="psec__row">
            <button class="btn btn--secondary btn--dense">Create request file… <span class="kbd">Ctrl+Shift+Q</span></button>
            <button class="btn btn--primary btn--dense">Load licence file… <span class="kbd">Ctrl+Shift+O</span></button>
            <span class="spacer"></span>
            <button class="btn btn--ghost btn--dense" disabled>Activate online</button>
          </div>
          <span class="field__hint">Send the request file to your distributor from any computer; load the signed licence file they return. Online activation is off on this offline workstation.</span>'''),
])
settings_page("21-licence", "Settings · Licence", "Licence page (brief §12.7): modules with status, offline activation by request and signed licence file.", "Site settings · administrator", "Licence", lic)

# ── 21 System ─────────────────────────────────────────────────────────────────
system = "\n".join([
    card("Hardware tier", '''          <div class="grid3">
            <div class="kv"><dt>Detected tier</dt><dd><span class="chip chip--accent">Clinical desktop</span></dd></div>
            <div class="kv"><dt>CPU</dt><dd>12 cores</dd></div>
            <div class="kv"><dt>Memory</dt><dd>32<span class="u">GB</span></dd></div>
            <div class="kv"><dt>GPU</dt><dd>Discrete · 12 GB · WebGL2</dd></div>
            <div class="kv"><dt>Displays</dt><dd>2 · one diagnostic</dd></div>
            <div class="kv"><dt>Power</dt><dd>Mains</dd></div>
          </div>
          <span class="field__hint">Tier sets defaults: 2×2 layouts and full 3D quality. Grayscale output is 8-bit through the rendering engine.</span>'''),
    card("Engine", '''          <div class="grid3">
            <div class="kv"><dt>Location</dt><dd>Local · 127.0.0.1</dd></div>
            <div class="kv"><dt>Status</dt><dd><span class="dot dot--success" style="display: inline-block"></span> Ready</dd></div>
            <div class="kv"><dt>Session token</dt><dd>Per session · rotated</dd></div>
            <div class="kv"><dt>Worker threads</dt><dd>10 of 12</dd></div>
            <div class="kv"><dt>Jobs</dt><dd>0 running · 0 queued</dd></div>
            <div class="kv"><dt>Folder</dt><dd class="mono">C:\\Program Files\\NeuroMR-PRO\\engine</dd></div>
          </div>'''),
    card("Storage and security", '''          <div class="grid3">
            <div class="kv"><dt>Data folder</dt><dd class="mono">D:\\NeuroMR-PRO\\data</dd></div>
            <div class="kv"><dt>Cache encryption</dt><dd>AES-256-GCM · key protected by Windows</dd></div>
            <div class="kv"><dt>Retention</dt><dd>14<span class="u">days</span></dd></div>
            <div class="kv"><dt>Cache size</dt><dd>1.2<span class="u">GB</span></dd></div>
            <div class="kv"><dt>DICOM TLS</dt><dd>On · certificates verified</dd></div>
            <div class="kv"><dt>Audit trail</dt><dd>Hash-chained · verified</dd></div>
          </div>
          <div class="psec__row"><button class="btn btn--secondary btn--dense">Purge cache now…</button><span class="spacer"></span><button class="btn btn--secondary btn--dense">Collect diagnostics… <span class="kbd">Ctrl+Shift+D</span></button></div>'''),
])
settings_page("21-system", "Settings · System", "Settings → System (brief §12.2, §12.4): hardware tier, engine location and state, storage and security.", "Workstation settings", "System", system)

# ── 22 Audit log ──────────────────────────────────────────────────────────────
events = [
    ("2026-11-22 14:32:10", "dr.neuro", "Neurologist", "Session locked", "Automatic after 15 min idle", "a41f…09c2"),
    ("2026-11-22 14:05:44", "dr.neuro", "Neurologist", "Report created", "Mismatch · PHANTOM0001", "7d20…e811"),
    ("2026-11-22 14:01:12", "dr.neuro", "Neurologist", "Series generated", "DSC maps model-free · 16 images · local store", "c3b9…5a07"),
    ("2026-11-22 13:58:03", "dr.neuro", "Neurologist", "Study opened", "PHANTOM0001 · DSC Neuro Perfusion", "19e6…b3d4"),
    ("2026-11-22 13:57:40", "dr.neuro", "Neurologist", "Signed in", "Windows SSO · WS-NEURO-03", "f08a…2c19"),
    ("2026-11-22 11:20:15", "site.admin", "Site administrator", "Setting changed", "Auto-lock 10 → 15 min", "66c1…d0ae"),
    ("2026-11-22 09:02:00", "system", "—", "Licence checked", "Spectroscopy trial ends 2026-12-13", "2b75…91f3"),
    ("2026-11-22 08:45:31", "tech01", "Technologist", "Import finished", "1 849 files · 1 quarantined", "e94d…4b60"),
]
ev_rows = "".join(f'<tr{" class=\"is-selected\" aria-selected=\"true\"" if i == 2 else ""}><td class="mono">{t}</td><td>{u}</td><td class="t2">{r}</td><td class="strong">{a}</td><td>{o}</td><td class="mono t2">{h}</td></tr>' for i, (t, u, r, a, o, h) in enumerate(events))
audit = "\n".join([
    card("Audit log", f'''          <div class="psec__row">
            <div class="search" style="width: calc(var(--nm-space-12) * 6)"><svg class="ic"><use href="#i-search"/></svg><span>User, study, action</span></div>
            <button class="picker">Today<svg class="ic ic--sm"><use href="#i-chev-down"/></svg></button>
            <button class="picker">All actions<svg class="ic ic--sm"><use href="#i-chev-down"/></svg></button>
            <span class="spacer"></span>
            <span class="chip chip--accent"><svg class="ic ic--sm"><use href="#i-check"/></svg>Hash chain verified · 1 284 entries</span>
          </div>
          <table class="tbl tbl--dense">
            <colgroup><col style="width:15%"><col style="width:9%"><col style="width:12%"><col style="width:14%"><col><col style="width:10%"></colgroup>
            <thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Object</th><th>Entry hash</th></tr></thead>
            <tbody>{ev_rows}</tbody>
          </table>''', '<button class="btn btn--secondary btn--dense">Export ATNA syslog…</button><button class="btn btn--ghost btn--dense">Export CSV</button>'),
    card("Entry · Series generated", '''          <div class="grid3">
            <div class="kv"><dt>Workstation</dt><dd>WS-NEURO-03</dd></div>
            <div class="kv"><dt>Study</dt><dd class="mono">PHANTOM0001</dd></div>
            <div class="kv"><dt>Patient ID</dt><dd class="mono">NMR-PHANTOM-001</dd></div>
            <div class="kv"><dt>Previous hash</dt><dd class="mono">19e6…b3d4</dd></div>
            <div class="kv"><dt>Entry hash</dt><dd class="mono">c3b9…5a07</dd></div>
            <div class="kv"><dt>Chain</dt><dd>Consistent</dd></div>
          </div>'''),
])
settings_page("22-audit-log", "Settings · Audit log", "Audit log viewer for administrators (brief §12.4): hash-chained entries, integrity status, ATNA export.", "Site settings · administrator", "Audit log", audit)

diag = '''  <div class="scrim" data-od-id="collect-diagnostics">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="cd-title" style="width: calc(var(--nm-space-12) * 11)">
      <div class="dialog__head"><h2 class="dialog__title" id="cd-title">Collect diagnostics</h2><button class="ibtn" aria-label="Close (Esc)"><svg class="ic"><use href="#i-close"/></svg></button></div>
      <div class="dialog__body">
        <div class="field"><span class="field__label">Included</span>
          <label class="check is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Application and engine logs <span class="t3">last 7 days</span></label>
          <label class="check is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>System information <span class="t3">tier, GPU, displays</span></label>
          <label class="check is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Configuration <span class="t3">without passwords or keys</span></label>
          <label class="check"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Crash reports <span class="t3">none recorded</span></label>
        </div>
        <div class="notice notice--info" role="note"><svg class="ic"><use href="#i-info"/></svg><span class="notice__text">No images, DICOM headers or patient identifiers are included; log lines are de-identified before packing.</span></div>
        <label class="field"><span class="field__label">Save to</span><span class="input"><span class="input__value mono">D:\\Exports\\NeuroMR-PRO-diagnostics-2026-11-22.zip</span><button class="link dense">Browse…</button></span></label>
        <span class="progress"><span class="progress__bar" style="--v: 60%"></span><span class="progress__pct">60 %</span><span class="t2">packing engine logs</span></span>
      </div>
      <div class="dialog__foot"><button class="btn btn--secondary">Cancel <span class="kbd">Esc</span></button><button class="btn btn--primary" disabled>Save</button></div>
    </div>
  </div>'''
settings_page("22-collect-diagnostics", "Collect diagnostics", "Collect diagnostics (service): de-identified logs and system information, in progress with Cancel.", "Workstation settings", "System", system, diag)


# ── 23 Report previews ────────────────────────────────────────────────────────
def report(name: str, title: str, package: str, sections: list[str], paper: str) -> None:
    secs = "".join(f'<label class="check is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>{x}</label>' for x in sections)
    body = f'''<div class="app app--report">
  <!-- gen:topbar -->
  <!-- /gen:topbar -->
  <!-- gen:rail-reports -->
  <!-- /gen:rail-reports -->
  <aside class="panel" aria-label="Report" data-od-id="report-panel">
    <div class="panel__head" style="padding-top: var(--nm-panel-padding)">
      <div class="panel__head-row"><h1 class="panel__title">Report</h1></div>
      <p class="dense t2">{package} · PHANTOM0001</p>
    </div>
    <div class="panel__body">
      <section class="psec"><span class="eyebrow">Sections</span>{secs}</section>
      <section class="psec"><span class="eyebrow">Page</span>
        <div class="seg" role="radiogroup"><button class="seg__item is-selected" role="radio" aria-checked="true">A4</button><button class="seg__item" role="radio">Letter</button></div>
        <label class="check is-checked"><span class="check__box"><svg class="ic"><use href="#i-check"/></svg></span>Colour key images</label>
      </section>
      <section class="psec" style="border-bottom: 0"><span class="eyebrow">Output</span>
        <button class="btn btn--secondary btn--dense" style="align-self: flex-start">Store to PACS as encapsulated PDF</button>
        <span class="field__hint">Reports carry patient and study identifiers on every page.</span>
      </section>
    </div>
    <div class="panel__foot">
      <button class="btn btn--primary btn--block">Print… <span class="kbd">Ctrl+P</span></button>
      <button class="btn btn--secondary btn--block">Save PDF… <span class="kbd">Ctrl+Shift+S</span></button>
    </div>
  </aside>
  <div class="toolbar" role="toolbar" aria-label="Preview" data-od-id="toolbar">
    <button class="ibtn" aria-label="Zoom (Z)"><svg class="ic"><use href="#i-zoom"/></svg></button>
    <span class="dense">Fit page</span>
    <span class="tb-sep"></span>
    <span class="stepper">Page <b>1</b> / 1</span>
    <span class="spacer"></span>
    <span class="dense t3">Preview of the PDF exactly as printed</span>
  </div>
  <main class="report" aria-label="Report preview">
{paper}
  </main>
  <!-- gen:statusbar-report -->
  <!-- /gen:statusbar-report -->
</div>'''
    write(name, DOC.format(title=title, comment=f"PDF report preview ({package}): brief §12.6 contents; document colours are print tokens inside .paper only.", body=body))


IDS = '''      <dl class="paper__ids">
        <div><dt>Patient</dt><dd class="mono">PHANTOM^SYNTHETIC</dd></div><div><dt>Patient ID</dt><dd class="mono">NMR-PHANTOM-001</dd></div>
        <div><dt>Sex · birth date</dt><dd>O · 1970-01-01</dd></div><div><dt>Accession</dt><dd class="mono">PHANTOM0001</dd></div>
        <div><dt>Study date</dt><dd>2026-01-01</dd></div><div><dt>Modality</dt><dd>MR · 3.0 T</dd></div>
        <div><dt>Referring</dt><dd>—</dd></div><div><dt>Reported by</dt><dd>dr.neuro</dd></div>
      </dl>'''


def img(src: str, cap: str, lut: str = "", hi: str = "", lo: str = "", unit: str = "") -> str:
    bar = f'<div class="cbar" style="--lut: var(--nm-lut-{lut})"><span>{hi}</span><span class="cbar__ramp"></span><span>{lo}</span><span class="cbar__meta">{unit}</span></div>' if lut else ""
    return f'<figure><div class="paper__img"><img src="../assets/img/{src}" alt="{cap}">{bar}</div><figcaption class="paper__cap">{cap}</figcaption></figure>'


dsc_graph = re.search(r'<svg class="graph".*?</svg>', (S / "03-dsc-perfusion.html").read_text(encoding="utf-8"), re.S).group(0)
dsc_paper = f'''    <article class="paper" aria-label="DSC report page 1">
      <div class="paper__head"><div><h1>DSC Neuro Perfusion</h1><span class="p2">Demonstration site · Neuroradiology</span></div><div class="p2" style="text-align: right">Analysis 2026-11-22 14:05<br>NeuroMR-PRO 1.0.0-dev</div></div>
{IDS}
      <h2>Key images · slice 3/4</h2>
      <div class="paper__imgs">{img("dsc_source_peak.png", "Source · dyn 9/60")}{img("dsc_relcbv.png", "relCBV [ml/100 g] · Stroke 0–12", "stroke", "12", "0", "ml/100 g")}{img("dsc_relcbf.png", "relCBF [ml/100 g/min] · Stroke 0–80", "stroke", "80", "0", "ml/100 g/min")}</div>
      <h2>Region parameters</h2>
      <table class="ptbl"><thead><tr><th>ROI</th><th class="num">relCBV [ml/100 g]</th><th class="num">relCBF [ml/100 g/min]</th><th class="num">MTT [s]</th><th class="num">TTP [s]</th><th class="num">T0 [s]</th></tr></thead>
        <tbody><tr><td>ROI1</td><td class="num">1.48</td><td class="num">14.0</td><td class="num">6.58</td><td class="num">29.4</td><td class="num">23.1</td></tr>
        <tr><td>ROI1-mirror</td><td class="num">3.42</td><td class="num">42.5</td><td class="num">4.40</td><td class="num">16.8</td><td class="num">14.7</td></tr>
        <tr><td>ROI2</td><td class="num">3.83</td><td class="num">37.8</td><td class="num">5.55</td><td class="num">16.8</td><td class="num">14.7</td></tr>
        <tr><td><b>ROI1 / mirror</b></td><td class="num"><b>0.43</b></td><td class="num"><b>0.33</b></td><td class="num"><b>1.50</b></td><td></td><td></td></tr></tbody></table>
      <h2>Concentration-time curves</h2>
      <div class="paper__graph">{dsc_graph}</div>
      <h2>Method</h2>
      <p>Model-free analysis of ΔR2*(t) from DSC perf SNR50 (60 dynamics, TR 2.1 s, TE 30 ms); automatic AIF; no spatial or temporal smoothing. Perfusion values depend on acquisition and method; compare follow-ups with the same method.</p>
      <div class="paper__foot"><span>PHANTOM^SYNTHETIC · NMR-PHANTOM-001 · 2026-01-01</span><span>Default settings · page 1 of 1</span></div>
    </article>'''
report("23-report-dsc", "Report · DSC", "DSC Neuro Perfusion", ["Key images", "Region parameters and ratios", "Concentration-time graph", "Method summary"], dsc_paper)

mm_paper = f'''    <article class="paper" aria-label="Mismatch report page 1">
      <div class="paper__head"><div><h1>Diffusion–Perfusion Mismatch</h1><span class="p2">Demonstration site · Neuroradiology</span></div><div class="p2" style="text-align: right">Analysis 2026-11-22 14:05<br>NeuroMR-PRO 1.0.0-dev</div></div>
{IDS}
      <h2>Key images</h2>
      <div class="paper__imgs">{img("mismatch_core_on_adc.png", "Core on ADC · slice 2/2 · ADC < 620 ×10⁻⁶ mm²/s")}{img("mismatch_deficit_on_tmax.png", "Deficit on Tmax · slice 3/4 · Tmax > 6.0 s")}{img("mismatch_penumbra_on_b0.png", "Core (fill) and penumbra (hatched) on DWI b0")}</div>
      <h2>Volumes</h2>
      <table class="ptbl"><thead><tr><th>Measure</th><th class="num">Value</th><th>Unit</th></tr></thead>
        <tbody><tr><td>Perfusion volume (Tmax &gt; 6.0 s)</td><td class="num">6.7</td><td>ml</td></tr>
        <tr><td>Diffusion volume (ADC &lt; 620 ×10⁻⁶ mm²/s)</td><td class="num">1.9</td><td>ml</td></tr>
        <tr><td>Mismatch volume</td><td class="num">4.8</td><td>ml</td></tr>
        <tr><td><b>Mismatch ratio (perfusion − diffusion) / perfusion</b></td><td class="num"><b>72.1</b></td><td>%</td></tr></tbody></table>
      <h2>Method</h2>
      <p>Automatic seed-point segmentation with default thresholds. Perfusion dynamic 1 registered rigidly to the DWI b0 (local correlation). <b>Registration not reviewed by the user.</b> Tmax from Manual AIF deconvolution.</p>
      <p><b>Decision support only — not a stand-alone basis for selecting acute stroke treatment.</b></p>
      <div class="paper__foot"><span>PHANTOM^SYNTHETIC · NMR-PHANTOM-001 · 2026-01-01</span><span>Default thresholds · page 1 of 1</span></div>
    </article>'''
report("23-report-mismatch", "Report · Mismatch", "Diffusion–Perfusion Mismatch", ["Key images", "Volumes", "Method summary", "Registration status"], mm_paper)
print("ok")
