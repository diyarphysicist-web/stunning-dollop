# NeuroMR-PRO — Design Brief

Status: Phase 1 (Design). Written with the `design-brief` skill from `docs/PROMPT.md` §4–5, §12.2–12.4 and `docs/spec/FUNCTIONAL_SPEC.md`. Design work is done in Open Design (project **NeuroMR-PRO**, design system **neuromr-pro**). Screens exported from Open Design to `design/screens/` are the contract that code is built against.

## 1. Structured brief (I-Lang)

```
[PLAN:@DESIGN|type=clinical_workstation|product=NeuroMR-PRO]
  |palette=custom:quiet_instrument        # brief §4.2 values, see §4
  |accent=custom:signal_blue(#4DA3FF)     # single accent
  |typography=inter|size_base=13px
  |display=same_as_body|panel_title=16px/600
  |mono=jetbrains_mono                    # DICOM tags, coordinates, readouts
  |layout=workstation_shell               # rail + task panel + toolbar + viewport grid + inspector
  |mood=professional_minimal:engineered   # oscilloscope / flight deck, not consumer app
  |density=compact|unit=4px|row=28px|row_dense=24px|panel_pad=12px
  |exclude=gradients,glassmorphism,illustration,emoji,stock_photos,decorative_shadows,
           regulatory_claims,placeholder_copy,animated_image_data
  |responsive=desktop_first:1366x768..7680x4320,landscape+portrait,mixed_dpi
```

The skill's closed vocabulary does not cover a dark clinical workstation, so palette, accent and density are declared as `custom:` values whose concrete tokens are fixed by brief §4 (no guessing, no defaults applied). No dimension was left unspecified.

## 2. Product and users

NeuroMR-PRO is a Windows workstation for quantitative neuro-MRI post-processing: DSC and DCE perfusion, permeability, diffusion/DTI, Tractography, fMRI, Spectroscopy, longitudinal follow-up, advanced diffusion (IVIM / kurtosis), subtraction and echo accumulation. Users read images for hours at a time and judge numbers that feed clinical decisions.

| Role (§12.4) | What they need first | Default start view |
|---|---|---|
| Radiologist / neuroradiologist | Fast case triage, every map with units, reports | Directory |
| Neurologist | Stroke mismatch volumes, lesion follow-up | Mismatch + Longitudinal |
| Neurosurgeon | Tracts and activation on anatomy, navigation export | Tractography + fMRI |
| Technologist | Import, classification, pre-processing status | Directory |
| Physicist / QA | Display test pattern, phantom checks, injection presets | Settings |
| Site administrator | Licences, audit log, policies, diagnostics | Settings → System |
| Service | Diagnostics, engine location, logs | Collect diagnostics |

Role controls visible packages, PACS store rights, who edits shared presets and thresholds, and who changes site settings. Unlicensed modules never appear in clinical workspaces.

## 3. Environment

- **Lighting:** dark reading room is the primary case (chrome must recede, images are the brightest thing on screen); bright offices and operating-room planning are secondary. Dark-room mode dims chrome further.
- **Hardware tiers (§12.2):** Minimum 1366×768 (2D only, Tractography 3D hidden with a reason) · Laptop 1920×1080 / 2560×1600 at 125–150 % (1×2 start layout, panels as overlays below 1600 px) · Clinical desktop 2560×1440 / 4K (2×2) · Diagnostic station with 2–4 displays incl. 5MP portrait 2048×2560 and 4K–8K colour (multi-window hanging protocols, inspector open by default at ≥ 3840 px).
- **DPI:** per-monitor DPI v2; every size is a CSS-pixel token scaled by devicePixelRatio; canvases render at native device pixels.
- **Input:** keyboard first (every primary action has a shortcut, `?` opens the sheet), mouse with modes, precision touchpad (two-finger scroll = slice, pinch = zoom), pen. Nothing is reachable only by hover.
- **Offline:** no web fonts, icons or help from the internet. Inter and JetBrains Mono ship with the app.
- **Language:** English only. Every UI string lives in one message catalog, so translation stays possible later.

## 4. Visual direction — "Quiet instrument"

Near-black, low-luminance workspace. Chrome recedes; data, maps and curves come forward. Precise, calm, dense, engineered. No gradients on chrome, no glass, no illustration, no emoji.

| Role | Token | Value |
|---|---|---|
| Viewport background | `--nm-color-viewport` | `#000000` (never tinted) |
| App background | `--nm-color-bg` | `#0B0D10` |
| Panel surface | `--nm-color-surface` | `#12151A` |
| Raised surface | `--nm-color-raised` | `#181C22` |
| Hairline border | `--nm-color-border` | `#232830` |
| Focus ring / accent / info | `--nm-color-accent` | `#4DA3FF` |
| Text primary / secondary / tertiary | `--nm-color-text-*` | `#E6E9EE` / `#9AA3AF` / `#838B98` |
| Success / warning / critical | `--nm-color-*` | `#3CCB7F` / `#F2B441` / `#FF5A5F` |

All text/surface pairs ≥ 4.5:1 (unit-tested). Data colours (LUTs, ROI palette, mismatch pair) live only in `packages/viewer/src/luts/`: Gray, Blue-to-Red, Stroke LUT, Hot, viridis; ROI1…ROI8 Okabe–Ito order; diffusion core vermilion `#D55E00`, perfusion deficit sky `#56B4E9`, penumbra = deficit hatched.

Typography: Inter 13 px base, 12 px dense tables, 11 px viewport overlays (1 px black text shadow), 16 px panel titles, tabular numerals everywhere. JetBrains Mono for DICOM tags, coordinates and numeric readouts.

Layout: 4 px unit; panel padding 12 px; rows 28 / 24 px. Shell = 48 px top bar (patient banner + global actions), 56 px activity rail, 300 px task panel (collapsible to 0), 40 px toolbar, viewport grid, optional 280 px inspector. Grids 1×1, 1×2, 2×1, 2×2 (default), 2×3, 3×3 and user presets.

Icons: original 20 px outline set, 1.5 px stroke, tooltip with shortcut on every icon. Motion: 120 ms ease-out for panels, 0 ms inside viewports; image data never animates.

## 5. UX laws (every screen must pass — brief §4.6)

1. The image is never covered by a modal unless asked for; image-interactive dialogs (Define AIF, co-registration) are full workspaces.
2. Every package uses the same skeleton: steps left, toolbar top, 2×2 viewports (source, live maps, table/anatomical, graph/anatomical); laptop may start 1×2 with the four roles one key away.
3. Steps are numbered, show completion, and can be revisited in any order once prerequisites are met.
4. Every number has a unit; every map shows name, units, LUT bar and window range.
5. Every operation > 300 ms shows progress with Cancel; the UI never blocks.
6. All primary actions have keyboard shortcuts; `?` opens the shortcut sheet.
7. Right-click menus exist on every viewport, table and graph and mirror toolbar functions.
8. Undo/redo (`Ctrl+Z` / `Ctrl+Y`) for ROIs, segmentation and registration edits.
9. State is never lost: bookmarks and autosave restore ROIs, AIF, thresholds, layout, maps.
10. Warnings are contextual, one sentence, actionable.

Patient-safety rules that shape every screen (FUNCTIONAL_SPEC §16): patient banner in every window (SAFE-001); R/L/A/P/S/I markers on every 2D viewport (SAFE-040); stale results visibly marked and not exportable (SAFE-030); non-default settings flagged (SAFE-060); unreviewed registration labelled (SAFE-070). No regulatory claims and no "research use only" banners anywhere.

## 6. Information architecture

- **Activity rail:** Directory, Viewer, Analysis, Results/Reports, Settings.
- **Patient banner:** name, ID, sex, age, study date, modality, field strength, accession.
- **Left panel switcher:** Series / Package / Key Images / Bookmarks (one control, four tabs).

## 7. Screen inventory

Numbering matches `design/screens/<nn>-<name>.{html,png}`. Screens 01–24 are brief §5.2; 25–26 are the extra screens required by FUNCTIONAL_SPEC.

| # | Screen | Requirement IDs |
|---|---|---|
| 01 | Study Directory with analysis launcher | DIR-001…006, GEN-191 |
| 02 | Analysis Workspace shell (labelled 2×2 template) | GEN-001…005 |
| 03 | DSC Neuro Perfusion — maps, ROI + mirror, ratio table, curves | DSC-001…031, GEN-030…045 |
| 04 | Define AIF workspace (7×7 box, 49 curves, averaged AIF) | DSC-020…024 |
| 05a / 05b | Diffusion–Perfusion Mismatch, 2×2 and 2×3 | MM-001…012 |
| 06 | Co-registration Review & Edit | REG-001…006 |
| 07 | DCE / T1 Perfusion | DCE-001…006 |
| 08 | Permeability | PERM-001…010 |
| 09a / 09b | Diffusion, 2×2 maps and 1×1 map | DIF-001…011 |
| 10 | Tractography | TRK-001…015 |
| 11a / 11b | Brain Function: SPM analysis, Paradigm Editor | FMRI-001…014 |
| 12 | Spectroscopy | MRS-001…013 |
| 13a / 13b | Longitudinal: Longitudinal mode, Compare + change map | LBA-001…042 |
| 13c | Lesion properties dialog with volume trend | LBA-037, LBA-040 |
| 14a / 14b | Advanced Diffusion: cDWI and Analyze signal | ADV-001…011 |
| 15a / 15b | Subtraction; Echo Accumulation | SUB-001…009, ECHO-001…003 |
| 16a / 16b | Generate Series dialog; Save All Tables dialog | GEN-160…171 |
| 17a / 17b / 17c | Layout preset manager; Settings; Shortcut sheet | GEN-150…152, PERM-006 |
| 18a / 18b | States: Directory (empty/loading/error); package (invalid input/progress) | DIR-006, GEN-191, UX law 5 |
| 19a / 19b / 19c | Sign-in; Lock screen; Role-based start view | §12.4 |
| 20a / 20b | Multi-monitor setup + hanging-protocol editor; Display test pattern | §12.3 |
| 21a / 21b | License page; Settings → System | §12.7, §12.2 |
| 22a / 22b | Audit log viewer; Collect diagnostics | §12.4–12.5 |
| 23a / 23b | PDF report preview: DSC; Mismatch | §12.6 |
| 24 | Laptop DSC (1920×1080 @150 %, overlays) | §12.3 |
| 25 | Longitudinal 4-study layout | LBA-001, LBA-020 |
| 26 | Extended lesion types: Cavernoma, Bleeding, Edema in findings and properties | LBA-037 |

## 8. Content rules

- Real map names, parameters and units (relCBV [ml/100 g], relCBF [ml/100 g/min], MTT [s], Tmax [s], Ktrans [min⁻¹], ADC [×10⁻⁶ mm²/s], FA, T-score, NAA/Cr …), real DICOM tag names with (gggg,eeee) numbers, plausible values.
- Imagery is grayscale and map data rendered from the repository's synthetic phantoms (`pnpm phantoms`), never stock photos. The phantoms are geometric digital test objects (disc with tissue-class stripes, spherical lesions), so screens show those shapes — the same data the app will display in Phase 2 tests.
- Patient banner uses the phantom's own DICOM values: PatientName (0010,0010) `PHANTOM^SYNTHETIC`, PatientID (0010,0020) `NMR-PHANTOM-001`, PatientSex (0010,0040) `O`, PatientBirthDate (0010,0030) 1970-01-01 → 56 y, StudyDate (0008,0020) 2026-01-01, Modality MR, MagneticFieldStrength (0018,0087) 3.0 T, AccessionNumber (0008,0050) `PHANTOM0001`. Longitudinal screens use the same patient with earlier study dates.
- Copy is original, terse, and actionable. No TODO, lorem ipsum, "coming soon", or regulatory claims.
