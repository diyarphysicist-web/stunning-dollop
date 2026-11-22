# NeuroMR-PRO Design System — "Quiet instrument"

> Category: Clinical workstation · Dark · Dense · Keyboard-first
> Package id: `neuromr-pro` (Open Design). Canonical tokens: `tokens.css` in this package. Application export: `packages/ui/src/tokens/`.

## 1. Visual Theme & Atmosphere

- **Mood:** engineered, calm, precise. Closer to an oscilloscope or a flight deck than to a consumer app.
- **Rule of luminance:** the images are the brightest thing on screen. Chrome recedes; maps, curves and numbers come forward.
- **Never:** gradients on chrome, glassmorphism, blur, decorative illustration, emoji, stock photos, marketing tone, regulatory claims ("cleared", "certified", "research use only").
- **Environment:** dark reading room first; also bright offices and OR planning. Dark-room mode lowers chrome text one step (primary → secondary) and hides non-essential borders.

## 2. Color Palette & Roles

### Chrome

| Token | Hex | Role |
|---|---|---|
| `--nm-color-viewport` | `#000000` | Viewport background. Chrome never tints image pixels. |
| `--nm-color-bg` | `#0B0D10` | App background, rail, top bar |
| `--nm-color-surface` | `#12151A` | Panels (task guidance, inspector, tables) |
| `--nm-color-raised` | `#181C22` | Raised controls, menus, dialogs, table header |
| `--nm-color-hover` | `#1D222A` | Hover fill for rows and buttons |
| `--nm-color-border` | `#232830` | Hairline borders and viewport gutters |
| `--nm-color-border-strong` | `#2E3540` | Input borders, popover outline |
| `--nm-color-text-primary` | `#E6E9EE` | Values, titles, active labels (13.1–16.0:1) |
| `--nm-color-text-secondary` | `#9AA3AF` | Labels, units, inactive tabs (6.3–7.6:1) |
| `--nm-color-text-tertiary` | `#838B98` | Hints, timestamps, disabled-but-readable (4.65–5.66:1) |
| `--nm-color-accent` | `#4DA3FF` | The single accent: interactive, selection, active tool, focus ring, info |
| `--nm-color-text-on-accent` | `#0B0D10` | Text on accent fills (7.4:1) |
| `--nm-color-success` / `warning` / `critical` | `#3CCB7F` / `#F2B441` / `#FF5A5F` | Step done / caution, stale / error, block |

Every text token passes ≥ 4.5:1 on every surface including hover (unit-tested in `packages/ui`). Subtle fills (`*-subtle`) are 12–14 % alpha of their colour and only ever sit behind primary text.

### Data colours (not chrome; live in `packages/viewer/src/luts/`)

- **LUTs:** Gray; Blue-to-Red (blue → green → yellow → orange → red); **Stroke LUT** (black → light blue → green → yellow/orange → red); Hot; viridis for statistics (fMRI T-score). Every colour map shows a vertical colour bar (12 px wide) with max on top, min at bottom, unit and window range.
- **ROI palette** (colour-vision-safe, Okabe–Ito order) ROI1…ROI8: `#E69F00` `#56B4E9` `#009E73` `#F0E442` `#0072B2` `#D55E00` `#CC79A7` `#FFFFFF`. One ROI = one colour in outline, table row marker and graph curve.
- **Mismatch:** diffusion core `#D55E00` (vermilion), perfusion deficit `#56B4E9` (sky), penumbra = deficit minus core, sky with 45° hatching option.
- Accent blue is never used as a data colour inside a viewport, so selection is never confused with data.

## 3. Typography Rules

| Use | Family | Size / line | Weight |
|---|---|---|---|
| Viewport overlay text | Inter | 11 / 14 px, 1 px black text shadow | 500 |
| Dense tables, DICOM tag lists | Inter (values: JetBrains Mono) | 12 / 16 px | 400 |
| Base UI | Inter | 13 / 18 px | 400; labels 500 |
| Panel titles | Inter | 16 / 22 px | 600 |
| Page headings (Settings, Licence, Sign-in) | Inter | 20 / 26 px | 600 |
| Display (sign-in product name only) | Inter | 28 / 34 px | 600 |
| DICOM tags, coordinates, numeric readouts | JetBrains Mono | inherits size | 400 |

- `font-variant-numeric: tabular-nums` everywhere a number appears. Numbers right-aligned in tables; unit in the column header or a secondary-colour suffix, never omitted.
- Sentence case for all labels. Uppercase only for orientation markers (R L A P S I) and 11 px section eyebrows.
- Clinical numbers use Western digits in every language.

## 4. Component Stylings

- **Buttons:** 28 px high (24 px dense), radius 4 px, 12 px horizontal padding. Primary = accent fill + on-accent text, max one per region. Secondary = raised fill + border-strong hairline. Ghost = transparent, secondary text, hover fill. Destructive = critical text on raised, critical fill only on confirm.
- **Icon buttons:** 28 × 28 hit area, 20 px outline icon (1.5 px stroke). Active tool = accent-subtle fill + accent icon + 2 px accent bottom bar. Tooltip shows name and shortcut (`Window/Level  W`).
- **Inputs / selects / number fields:** 28 px, surface fill, border-strong hairline, radius 4 px; unit as a suffix inside the field in secondary text; focus = 2 px accent ring outside the border.
- **Sliders:** 2 px track (border-strong), accent fill, 12 px thumb; numeric field beside every slider. Two-handle threshold sliders on colour bars.
- **Task-guidance step:** 28 px row: number badge (20 px circle) · title · state. States: not started (tertiary outline), current (accent fill number, accent left bar), done (success check), stale (warning dot, "Recompute"), blocked (lock + one-line reason).
- **Tabs:** 32 px, text tabs with 2 px accent underline for active. Left panel switcher = segmented control with four tabs.
- **Tables:** 28 px rows (24 dense), raised header, sticky; ROI colour swatch 8 × 8 px at row start; zebra off; selected row = accent-subtle; stale table = warning bar on top with "Results are out of date — Recompute (F5)".
- **Viewport:** black, 1 px border gutter; active viewport = 1 px accent border. Overlay corners: top-left series/map name + units; top-right patient + slice/dynamic; bottom-left W/L or window range; bottom-right zoom + position; centred-edge orientation markers. Colour bar on the right edge inside the viewport.
- **Notices (inline):** one sentence, icon + text + optional action link, 28 px, subtle semantic fill. Never a modal.
- **Dialogs:** only when the user asked (Generate series, Save tables, Settings). Raised surface, popover elevation, 16 px title, actions bottom-right (primary rightmost), Esc closes, Enter confirms. Dialogs that need image interaction are full workspaces instead.
- **Progress:** inline determinate bar (2 px) + percentage + Cancel for > 300 ms; long jobs also in the status bar job tray.
- **Context menu:** raised, 24 px items, shortcut right-aligned in tertiary text, separators as 1 px border.

## 5. Layout Principles

- 4 px unit. Panel padding 12 px. Gaps 8 px within a group, 16 px between groups.
- **Shell:** top bar 48 px (patient banner + global actions) · activity rail 56 px (Directory, Viewer, Analysis, Results/Reports, Settings) · task panel 300 px (collapsible to 0) · toolbar 40 px · viewport grid fills the rest · optional inspector 280 px · status bar 24 px (jobs, engine, licence, display).
- Viewport grids: 1×1, 1×2, 2×1, **2×2 (default)**, 2×3, 3×3, user presets. Default analysis roles: (1) source · (2) live maps · (3) table ↔ anatomical · (4) graph ↔ anatomical.
- Below 1600 px window width the task panel and inspector become overlays over the grid edge (never over the centre of an image). At ≥ 3840 px the inspector is open by default.
- RTL (Arabic, Kurdish): chrome mirrors (rail on the right, text right-aligned, panel order reversed). Viewports, orientation markers, graph axes, DICOM overlays and 3D never mirror.

## 6. Depth & Elevation

- Flat by default. Separation is done with surface steps (bg → surface → raised) and 1 px hairlines, not shadows.
- One elevation only: popovers, menus and dialogs (`--nm-elevation-popover` = strong hairline + dark drop). Scrim `#000000B3` behind dialogs.
- Radii are small (2 / 4 / 6 px): engineered, not soft.

## 7. Motion & Interaction

- Panels open/close: 120 ms ease-out. Hover/focus feedback: instant.
- Anything inside a viewport: 0 ms. Image data never animates (no fades between slices or maps).
- Every interactive element has visible `:focus-visible` (2 px accent ring). Full keyboard operation; `?` opens the shortcut sheet. Nothing is reachable only by hover.
- States for every control: default, hover, active/pressed, focused, disabled (tertiary text + reason tooltip), busy (inline spinner + Cancel), error (critical hairline + one-line message).

## 8. Voice

- Terse, factual, actionable. "Needs ≥ 2 b-values (series has 1)." not "Oops, this package can't run."
- Warnings are one sentence and say what to do: "AIF peak is broad — move the box over a larger artery or reduce partial volume."
- Never: TODO, lorem ipsum, "coming soon", exclamation marks, regulatory claims.

## 9. Do's and Don'ts

- DO use only `--nm-*` tokens in chrome. Data colours come only from `packages/viewer/src/luts/`.
- DO show unit on every number and name + units + LUT bar + window range on every map.
- DO keep orientation markers on every 2D viewport and the patient banner in every window.
- DO mark stale results (warning) and non-default settings (flag chip "Non-default: smoothing Medium").
- DON'T cover the image with a modal the user did not ask for.
- DON'T use accent for more than selection, focus, active tool and the single primary action per region.
- DON'T use shadows or gradients on chrome. DON'T animate image data.
- DON'T hide a function only in a context menu or only behind hover.

## 10. Agent Prompt Guide (for Open Design runs)

- Link `assets/tokens.css` and use `var(--nm-*)` only. No raw hex, px font sizes or font names outside the tokens file (data colours from `assets/data/luts.css` only).
- Desktop canvas 1920×1080; root `html, body { margin:0; height:100%; background: var(--nm-color-bg); }`.
- Imagery: only the PNGs in `assets/img/` (rendered from the synthetic phantoms). Curves and spectra: draw SVG polylines from `assets/data/*.json`, or inline the numbers.
- Every screen: patient banner, activity rail, orientation markers on 2D viewports, units on every number, a visible keyboard shortcut path, context-menu affordance.
