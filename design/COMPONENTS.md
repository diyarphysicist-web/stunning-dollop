# NeuroMR-PRO — Component inventory

Derived from the exported screens in `design/screens/` (brief §3 step 7). Every component is styled only with `--nm-*` tokens (`packages/ui/src/tokens/`); data colours (LUTs, ROI palette, mismatch, FA direction, plane lines) come only from `packages/viewer/src/luts/`. The reference CSS is `design/screens/shell.css`; section numbers below point to it. The React library (Phase 2) implements these components with Radix primitives and the same class contracts.

**States used throughout:** default · hover · active (pressed or current) · focused (2 px accent ring, outside, `:focus-visible` only) · disabled (tertiary text, no hover, reason in tooltip) · busy (inline progress with Cancel; never a blocking spinner) · error (critical border plus a one-sentence message that names the fix). Motion: 120 ms ease-out for panels and overlays; 0 ms inside viewports.

**Keyboard rules:** every action has a shortcut shown in its tooltip and in the shortcut sheet (`?`). Tab order follows reading order (mirrored in RTL). `Esc` closes the topmost popover, menu or dialog. Arrow keys move inside composite widgets (segmented controls, tabs, lists, grids). `Shift+F10` or the context-menu key opens the context menu of the focused viewport, table or graph.

---

## 1. Application shell (§3–§6, §20)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **App grid** | analysis (rail · panel · toolbar · grid · inspector · status), `--no-inspector`, `--settings` (rail · content), `--report` (rail · panel · preview), `--laptop` (panels as overlays below 1600 px) | — | `Ctrl+B` task panel, `I` inspector, `F11` fullscreen |
| **Top bar / patient banner** | single study, two studies, no patient ("No patient selected"), laptop (name, ID, sex, age, study date only; SAFE-001 minimum) | — | `Ctrl+K` search, `?` shortcuts |
| **Activity rail** | Directory, Viewer, Analysis, Reports, Settings | default, hover, active (2 px accent bar + accent icon), focused | `Ctrl+1…4`, `Ctrl+,` |
| **Task panel** | steps, sub-workspace (breadcrumb, e.g. Define AIF, Co-registration), sources (Directory), report options, overlay (`.panel--overlay`, laptop) | open, collapsed | `Ctrl+B`; `Ctrl+Enter` = primary footer action |
| **Left panel switcher** | Series · Package · Key Images · Bookmarks | selected, hover, focused | `Alt+1…4` |
| **Inspector** | ROI properties, bundles + statistics, finding, launcher ("Open with") | open, closed | `I` |
| **Status bar** | jobs, result state (up to date / stale / failed / importing), engine, licence, display role, battery | busy (inline progress + Cancel), warning, critical | — |
| **Breadcrumb** | sub-workspace path | — | `Alt+←` back |

## 2. Task guidance (§7)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Step** | done (success check + summary), current (accent badge, left bar, body expanded), todo, stale (warning badge + Recompute), blocked (dashed badge + one-line reason), optional | hover (revisitable steps), focused | `↑↓` move, `Enter` open, `Ctrl+Enter` continue |
| **Step body** | fields, notices, CTA row | — | Tab through fields |
| **Quality-check list** (`.qc`) | pass, warn, values | — | — |

## 3. Toolbar and controls (§8–§11)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Icon button** (`.ibtn`) | 28 px, small 24 px, toggled tool (`.is-active`: subtle accent fill + 2 px underline) | default, hover, active, focused, disabled | its shortcut (e.g. `S`, `P`, `Z`, `W`, `M`, `E`, `C`, `F`, `L`, `R`) |
| **Tooltip** | name + shortcut chip | shown on hover and on focus after 400 ms | — |
| **Picker** | layout, preset, filters | hover, open, focused | `Enter`/`↓` opens |
| **Button** | primary, secondary, ghost, destructive (+ confirm), dense, block | default, hover, active, focused, disabled, busy | `Enter`/`Space`; shortcut chip on the button |
| **Keyboard chip** (`.kbd`) | inline, on primary | — | — |
| **Segmented control** | 2–5 items, grid 2×N (`.seg--grid2`), panel switcher | selected, hover, focused, disabled item with reason | `←→` move, `Space` select |
| **Tabs** | 32 px, dense in viewport heads | active (2 px accent underline), hover, focused, disabled tab (computed on Generate) | `←→`, `Ctrl+Tab` |
| **Input** | text, number with unit suffix, dense, read-only (disabled look) | default, hover, focused, disabled, error (+ `.field__error`) | type; `↑↓` step numbers |
| **Select** | standard, dense, in viewport head (transparent) | default, hover, open, focused, disabled | `Enter`/`↓` opens, type-ahead |
| **Slider** | single with numeric field, range (two thumbs), threshold on colour bar | default, hover, dragging, focused | `←→` step, `Shift` ×10, `Home`/`End` |
| **Checkbox** | default, legend toggle with curve swatch | checked, unchecked, focused, disabled | `Space` |
| **Switch** | — | on, off, focused, disabled | `Space` |
| **Chip** | neutral, warning (Not reviewed, Example, Edited), accent (fitted metabolites, tier) | — | — |
| **Search field** | toolbar, dialog head | focused | `Ctrl+K`, `Esc` clears |
| **Nudge pad** | translate 3×3, rotate pair | hover, active, focused | `Shift+arrows` translate, `Shift+,`/`Shift+.` rotate |

## 4. Viewports (§12–§13, §24, §28)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Viewport grid** | 1×1, 1×2, 2×1, 2×2 (default), 2×3, 3×3, AIF (tall + 2), REG (tall + 3), tiles (SPM), maps 2×2 inside one viewport | — | `Ctrl+L` layout, `Tab` next viewport, `Enter` maximise, `F6` role pager (laptop) |
| **Viewport** | image (fitted stage, square or 2:1 for coronal/sagittal), panel (table), graph, 3D | default, active (1 px accent outline + accent head rule), busy (`.vp__state` progress + Cancel, no colour bar without a map), empty | `↑↓` slices, `←→` dynamics / b-values / maps |
| **Viewport head** | role label, series select, map tabs, stepper, link indicator, menu | — | — |
| **Overlay text** | four corners, orientation markers (never mirrored, also in RTL), ROI labels, probe readout | — | — |
| **Colour bar** | vertical with max/min, unit, window; compact (tiles, maps 2×2, report) | — | right-drag adjusts window |
| **ROI graphics** | ellipse, spline, freehand, rectangle; linked mirror (dashed); handles; halo for colour maps | selected (handles), hover | `Del`, `Ctrl+D`, `Ctrl+Z` |
| **Mirror line / plane lines / crosshair** | mirror (accent + grip), axial/coronal/sagittal (plane palette + grip), crosshair (accent, gap) | dragging | `L`, `X` |
| **Segmentation overlay** | core fill, deficit fill + outline, penumbra hatched, seed markers (core/deficit), PRESS box (processed colour) | opacity per viewport | `H` hatching, `D` seed |
| **AIF box + curve grid** | 7×7 box with voxel grid, 49 mini-curves, included/excluded | included (accent), excluded (tertiary) | arrows move the box, `Space` toggles the focused curve |
| **Context menu** | viewport, table, graph; items mirror toolbar functions | item hover, submenu, disabled with reason | `Shift+F10`, arrows, `Enter`, `Esc` |

## 5. Data display (§14, §21, §25–§26)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Table** | 28 px rows, dense 24 px, sticky raised header with unit line, numeric right-aligned (RTL: numbers isolated LTR), ROI swatch (solid, linked outline, hatched), total row, current column | row hover, selected, focused cell | arrows, `Ctrl+C` copy TSV, click a slice column to jump |
| **Stale bar** | stale results, export blocked (SAFE-030) | — | `Ctrl+R` recompute |
| **Graph** | time curves, voxel grid, signal vs b, spectrum (ppm decreasing to the right), trend, paradigm shading, fitted line (neutral dashed), markers | — | right-click menu; legend toggles |
| **Legend** | curves with toggles, swatches, direction colours | — | — |
| **Key-value list** (`.kv`) | panel, inspector, card | — | — |
| **Series thumbnail + type badge** | image, mini-spectrum; DSC, DCE, DWI, DTI, fMRI, MRS-SVS, MRS-CSI, FLAIR, T1, T2, SWI, VFA ref | — | — |
| **Launcher list** (`.lx`) | valid (success check), invalid (reason line from `validity.ts`), sub-line, selected | hover, selected, focused, disabled | arrows, `Enter` opens |
| **Tree** | bundles → ROIs, findings | selected, expanded/collapsed, hover | arrows, `←→` collapse/expand, `F2` rename |
| **Progress** | 2 px bar + percent + label + Cancel | busy | `Esc` cancels the focused job |
| **Empty state** | small (inspector), big (Directory) | — | the primary action has focus |
| **Skeleton row** | loading list rows | — | — |

## 6. Feedback (§15, §17–§18)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Inline notice** | info, warning, critical; one sentence; optional inline action | — | action is a link button in tab order |
| **Persistent notice** (`.persist`) | decision-support statement pinned in the panel foot (MM-011) | — | — |
| **Field error** | under the field; names the valid range and likely cause | — | focus returns to the field |
| **Dialog** | small (in inspector), standard, large (wizard, presets, shortcut sheet), XL; head with title, optional wizard steps or search; foot actions bottom-right | open, busy (progress, primary disabled) | `Esc` cancel, `Enter` primary, focus trapped |
| **Popover** | anchored dialog inside the inspector (bundle settings, lesion properties) | open | `Esc` |
| **Scrim** | only for user-opened dialogs that need no image interaction | — | — |
| **Wizard steps** | done, current | — | `Alt+B` back |
| **Drop zone** | imported file summary | hover, drag-over, error | `Ctrl+O` |

## 7. Settings, gates and documents (§27–§28)

| Component | Variants | States | Keyboard |
|---|---|---|---|
| **Settings navigation** | grouped (Workstation, Analysis, Site) | selected, hover, focused | arrows, `Enter` |
| **Settings card** | head with actions, body | — | — |
| **LUT preview bar** | horizontal gradient from `--nm-lut-*-h` | — | — |
| **Monitor diagram** | display boxes with role and diagnostic flag, stand | selected | arrows select, `Enter` edit |
| **Gate** | sign-in, lock (no patient data) | input focus, error | `Enter` primary |
| **Report paper** | A4/Letter, print tokens only, header, identifiers, key images with colour bars, print tables, graph, method, footer | fit page | `Ctrl+P` print, `Ctrl+Shift+S` save PDF |
| **Test pattern** | full window on the display under test | — | `Esc` close |

## 8. Bidirectional text (§29)

Chrome mirrors in RTL through grid and flex direction; hairlines move to the inline end; directional icons flip (`.ic--flip`). Patient names, IDs, DICOM text, numbers (Western digits), units, keyboard chips and dates stay left-to-right, isolated with `.ltr` or by the table rules. Viewports, orientation markers, graph axes, DICOM overlays and the 3D view never mirror.
