# Self-critique against brief §4.6 (UX laws)

Each screen is checked against the ten laws after its first render; fixes are applied in Open Design (project **NeuroMR-PRO**) and re-rendered before commit. ✓ = passes, ~ = passes with a note, — = not applicable to the screen.

Laws: 1 image never covered · 2 shared skeleton · 3 numbered revisitable steps · 4 units, map name, LUT bar, window · 5 progress + cancel for slow work · 6 keyboard + discoverable shortcuts · 7 context menus mirror toolbar · 8 undo/redo · 9 state never lost · 10 warnings contextual, one sentence, actionable.

## Batch 2

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 04 Define AIF | ✓ | ~ | ~ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| 05 Mismatch 2×2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 05 Mismatch 2×3 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 06 Co-registration | ✓ | ~ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **04 Define AIF.** A full workspace, not a popup (law 1, DSC-020). It keeps the shell (rail, panel left, toolbar top) but swaps the 2×2 grid for source | curve grid | averaged AIF, because the task needs one large image beside 49 curves (law 2 ~). It is a sub-workspace of step 3: the breadcrumb leads back, and Apply / Cancel return to the step list (law 3 ~). The automatic quality check flags the phantom's AIF, which peaks 6.3 s after tissue because the Phase 0 phantom has no artery. The screen shows this real result instead of an idealised curve, and the warning names the fix. Undo restores the previous box position (DSC-022).
- **05 Mismatch.** Re-segment (law 5) runs as an engine job with progress and Cancel in the status bar job tray. The idle state is shown here. MM-011 is pinned in the panel footer so it never scrolls away. The "Registration not reviewed" chip appears beside the volumes (SAFE-070). Diffusion and perfusion viewers show their linked zoom: 160 % for the 80 mm DTI field and 100 % for the 128 mm DSC field. The 2×3 variant is the saved preset named in MM-003.
- **06 Co-registration.** A shared full workspace (REG-001). The main fused view plus three orthogonal references follow LBA-012, and Longitudinal is now listed as a REG user in `FUNCTIONAL_SPEC.md` §6. It has no step list (law 3 —) because it is a single task reached from a package step. Run again (law 5) reports progress with Cancel in the job tray. Unsaved edits are flagged in the panel and the status bar (law 9), and Cancel discards them. Coronal and sagittal views keep the true 1 mm aspect (64 × 32 mm).

Fixes made during critique
- Removed the seed-point tooltip and the on-image seed labels from Mismatch: they covered the diffusion tabs and were unreadable over the segmentation fill. The colour-coded seed markers match the panel's Seeds list.
- Perfusion segmentation moved from the colour Tmax map to a gray Tmax map, because the sky-blue deficit outline vanished against the Stroke LUT's light-blue band.
- Co-registration: rebuilt the nudge controls and the Undo/Redo/Reset row so they fit the 300 px panel.
- Corrected the DSC slice label on screens 02–03 from 2/4 to 3/4. The imagery is the middle slice (index 2 counting from zero).

## Batch 3

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 Study Directory | — | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| 07 DCE / T1 Perfusion | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 08 Permeability | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 09 Diffusion 1×1 / 2×2 | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **01 Directory.** Launcher reasons are copied verbatim from `packages/workspace/src/validity.ts` for the selection "DSC perf SNR50", so design and code agree. Pre-processing (DIR-005) shows inline progress with Cancel, and the gate keeps a series unavailable until it finishes. The quarantine notice (DIR-006) names the cause and links to the list. Series rows use the phantom's real series numbers, image counts and geometry.
- **Finding (spec/code, not design):** the current rules mark DCE / T1 Perfusion, Brain Function and Subtraction valid for a DSC series, because `validity.ts` checks dynamics only, not contrast or series type. DIR-003 already classifies series types; DIR-004 should use them (T1-weighted for DCE, BOLD for Brain Function). The screen shows today's rule outcome, unchanged. Raised as an open issue for Diyar. **Resolved 2026-11-22:** DIR-004 now checks the DIR-003 type first; for the DSC selection, DCE, Brain Function and Subtraction show their type reasons.
- **07 DCE.** Table values are computed from the phantom ROI curves by `inject_plots.py`, using a bilinear fit with a least-squares knee (DCE-006). MAXRELENH reads 144 / 101 / 84 % against truth 150 / 100 / 80 %, and the fitted lines are drawn for ROI1. ROI outlines now carry a 1 px black halo so they stay visible on colour maps (all screens).
- **08 Permeability.** The injection preset uses the phantom's values (r₁ 4.5 s⁻¹·mM⁻¹, 0.1 mmol/kg, medium, Hct 45 %; blood T1 1613 ms at 3.0 T, PERM-007). The example preset is flagged as an example (PERM-006). Ktrans/kep/ve/vp are the Tofts phantom's ground-truth classes, because the fit arrives in Phase 5. Task guidance follows the new PERM-012.
- **09 Diffusion.** The default layout is source | maps (DIF-002), so the 2×2 skeleton applies inside the map viewport (law 2 ~). ADC, eADC and DWI-iso are listed as computed on Generate, with no live preview (DIF-006). The FA-direction legend colours come from the new `FA_DIRECTION_PALETTE` in `packages/viewer/src/luts`. Task guidance follows the new DIF-012.

## Batch 4

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 Tractography | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 Brain Function | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 11 Paradigm editor (block, event) | ~ | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ |
| 12 Spectroscopy | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |

Notes
- **10 Tractography.** Layout follows TRK-002 (3D main view plus three reference views) rather than the 2×2 grid (law 2 ~); the steps panel, toolbar and inspector keep the shared skeleton. Streamlines are real: `render_phantom_imagery.py` tracks the DTI phantom's tensors with the TRK-006 rules (FA ≥ 0.20, ≤ 45° per step, ≥ 10 mm, step 0.5 voxel, one seed per voxel). That gives 26 fibers (64.3 mm) in the A–P band and 24 (16.0 mm) in the R–L band. The S–I band yields none, because its principal direction is through-plane on a 2-slice series, and the screen says so. The 3D view is a z-buffered render of the FLAIR planes with the FA-direction overlay and the fibers. Plane colours come from the new `PLANE_PALETTE`. The bundle settings dialog is anchored inside the inspector, so no image is covered (law 1).
- **11 Brain Function.** SPMs are shown tiled (FMRI-010), with the selected slice and the cluster's time-intensity curve beside them; the paradigm is shaded on the graph (FMRI-011). The FMRI-013 warning sits next to the curve it asks the user to check. There is no anatomical series covering the 144 mm BOLD field of view in the phantom study, so the underlay is the mean BOLD, and the screen says so.
- **11 Paradigm editor.** A modal wizard (FMRI-007) is acceptable under law 1: the user opens it, and it needs no image interaction. The block variant shows the sequential task/rest blocks of the phantom paradigm; the event variant shows the same paradigm imported as a BIDS TSV.
- **12 Spectroscopy.** SVS layout per MRS-002, with the spectrum and table in place of the 2×2 grid (law 2 ~). The spectrum, baseline, peak table and SNR come from the SVS phantom. Per-metabolite SNR is peak height divided by noise RMS (MRS-012). The quality legend uses the MRS-010 classes. The "Fitted" overlay is off, because no fit exists until Phase 8. The spectrum graph uses a wider viewBox so its text matches the 11 px overlay size.

## Batch 5

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 13 Longitudinal (Longitudinal mode) | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 Longitudinal (Compare mode) | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 13 Longitudinal (FLAIR* + central-vein review) | ✓ | ~ | ~ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 Advanced Diffusion (Analyze signal) | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 Advanced Diffusion (Computed DWI) | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 Subtraction | ✓ | ~ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 Echo Accumulation | ✓ | ~ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **13 Longitudinal.** Uses the two real FLAIR studies (2026-01-01, 2026-07-01). Lesions are detected (threshold 1.5 × median tissue, connected components) and matched by centroid in `render_phantom_imagery.py`. Their volumes equal the phantom truth voxel for voxel: L1 0.123 → 0.257 ml, L2 new, L3 0.257 → 0.123 ml, L4 stable, L5 disappeared; total 0.584 → 0.626 ml. The package is mode-driven (LBA-020…025) rather than step-driven, so laws 2 and 3 apply in adapted form (~): modes, findings and segmentation take the place of steps. The lesion properties dialog is anchored in the inspector (law 1). FLAIR* is enabled: the `swi_epi` phantom is in the 2026-01-01 study (revised 2026-11-22, see below). Compare mode shows the LBA-024 traffic light (green, matching series) and the change-map notice.
- **14 Advanced Diffusion.** Analyze signal fits kurtosis + simplified IVIM to the phantom ROI with the ADV-007 thresholds (b between 0 and 100 s/mm² excluded): D 1112 ×10⁻⁶ mm²/s, f 6.4 %, K 0.71, R² 0.9998, NRMSE 0.38 % of S0. Excluded b-values are drawn as hollow points on the graph. Computed DWI uses its 1×2 layout (ADV-002).
- **15 Subtraction / Echo Accumulation.** Compact single-task workspaces (law 2 ~, no steps). Subtraction shows the SUB-008 geometry check as passed, and the division-by-zero count in the status line (SUB-009). Echo Accumulation imagery comes from the `multi_echo_gre` phantom (revised 2026-11-22, see below).

### Revision 2026-11-22 — screens 13 and 15 on the new phantoms

- **13 FLAIR\* (new screen `13-flair-star`, composer `design/tools/compose/flair_star.py`).** LBA-025 3×3 grid: rows axial, coronal and sagittal through L1; columns SWI/EPI, FLAIR, FLAIR\*; pan and zoom linked by row, window by column; zoom 200 %. The SWI/EPI is registered to the baseline FLAIR by an in-plane rigid search (normalised cross-correlation, 0.25 mm steps, a design preview of the engine step). It finds Δy +1.5 mm, Δx −1.0 mm, which is exactly the phantom's built-in displacement. FLAIR\* = product of both after 99th-percentile normalisation in the brain (ALGORITHMS §9). The central vein of L1 shows as a dot in the axial view and a dark line through the lesion in the coronal and sagittal views. The vein outside every lesion (lower left in the axial view) shows that a vein alone is not a finding. The central-vein review follows the NAIMS consensus (LBA-026, revised 2026-11-22). The task panel lists the four baseline findings with their marks: L3 **Excluded · multiple veins**, L4 Present, L5 Absent, and L1 selected, not yet reviewed. The marks agree with the phantom: L3 has two distinct veins, L4 a central vein and L5 none. Below the list is the LBA-027 summary: counts per mark, CVS+ 50 % of evaluable lesions (1 / 2, with Indeterminate, Excluded and unreviewed lesions outside the denominator), and Select-3\* 1 / 3 and Select-6\* 1 / 6. It states counts only, no diagnosis. The inspector holds the selected finding: smallest diameter 7.0 mm (from its segmentation, which matters for the < 3 mm exclusion), the five NAIMS vein criteria as a checklist (four ticked, "central" still open, so Present is disabled), and the Present, Absent, Indeterminate and Excluded… marks; Excluded asks for one of the four NAIMS reasons. Keys 1–4 mark, and N moves to the next unreviewed finding. The notice still says that the marks are the user's reading and the app does not detect veins. "Registration not reviewed" stays until the user opens Review (SAFE-070). Law 5 does not apply (FLAIR\* computes in well under a second). Laws 2 and 3 are adapted, as in the other Longitudinal modes.
- **13 Longitudinal and Compare.** The FLAIR\* mode button is enabled; the hint now names the SWI EPI series that makes it available.
- **01 Directory (and 18 importing, 22 audit).** The study now lists SWI EPI (#610) and Multi-echo GRE (#620), matching screen 13. Totals are 17 series and 2 009 images; the import progress (412 / 2 009, 21 %) and the audit entry follow.
- **15 Echo Accumulation.** Source and result come from `multi_echo_gre` (TE 5/10/15/20 ms, T2\* 60 ms tissue and 30 ms lesions, SNR 100) at slice 16. L3 is darker because its T2\* is shorter; the small dot above it is the lower tip of L1. Contrast is low at TE 5 ms and rises in the sum, as the model predicts.

## Batch 6

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 16 Generate series | ~ | — | — | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| 16 Save all tables | ~ | — | — | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| 17 Layout presets | ~ | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| 17 Settings · analysis defaults | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 17 Settings · displays | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 17 Shortcut sheet | ~ | — | — | — | — | ✓ | — | — | — | — |
| 18 Directory empty | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| 18 Directory importing + PACS error | — | — | — | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| 18 DSC computing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 18 Mismatch invalid input + job error | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **Dialogs (16, 17).** Modal only because the user opened them, and none needs image interaction (law 1 ~). Generate Series disables Tmax / Delay with its reason, because Tmax needs the Manual AIF deconvolution method (DSC-013). It records the source series, method and non-default settings (GEN-162), and explains that registered saving can differ from the preview (GEN-161). Save All Tables lists each file it will write and says that files carry patient identifiers (SAFE-010).
- **Settings.** LUT defaults show a horizontal preview of each LUT, using the new `--nm-lut-*-h` gradients from the LUT module. The example injection preset is flagged and the screen tells the site to replace it (PERM-006). The display calibration check shows an honest "Not checked" state that leads to the test pattern (batch 7), and makes no pass/fail claim.
- **States (18).** Empty Directory: the banner says "No patient selected" rather than staying blank, and the screen offers the three ways to get data. Importing: progress with Cancel, skeleton rows for series not yet read, the launcher reason taken from `validity.ts` ("Waiting for import and pre-processing to finish."), and a one-sentence PACS error with Retry. DSC computing: the maps viewport shows progress and Cancel in place of the map (no colour bar without a map); the table is marked stale and export is blocked (SAFE-030). Mismatch: the invalid threshold is explained in one sentence that names the likely cause; the failed job offers Retry or Collect diagnostics.

Consistency fix found in this batch
- Tmax / Delay exists only for the Manual AIF method (DSC-013). Removed the Tmax tab from the Model-free screens (02, 03). The Mismatch screens (05) now state Manual AIF as the step-3 method, because Mismatch seeds on Tmax.

## Batch 7

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 19 Sign-in | — | — | — | — | — | ✓ | — | — | — | ✓ |
| 19 Lock | — | — | — | — | — | ✓ | — | — | ✓ | ✓ |
| 19 Start · Neurologist | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 20 Multi-monitor (hanging protocols) | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 20 Display test pattern | ✓ | — | — | ✓ | — | ✓ | — | — | — | ✓ |
| 21 Licence | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 21 System | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 22 Audit log | — | — | — | ✓ | — | ✓ | ✓ | — | ✓ | ✓ |
| 22 Collect diagnostics | ~ | — | — | ✓ | ✓ | ✓ | — | — | ✓ | ✓ |
| 23 Report · DSC | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |
| 23 Report · Mismatch | — | — | — | ✓ | — | ✓ | — | — | ✓ | ✓ |

Notes
- **19.** Sign-in offers the three site-configurable methods (Windows single sign-on, organisation account through the system browser, local account) and shows no patient data. The lock screen hides patient information and says when and why the session locked. The role start view (Neurologist) shows Mismatch and Follow-up work that background pre-processing has already prepared, still marked "Not reviewed" where registration needs checking.
- **20.** Window roles and hanging protocols per display configuration follow brief §12.3. The test pattern is an original, pixel-exact 8-bit image (grey steps, a ramp, 2 %/5 % and 95 %/98 % patches, 1–3 px line pairs and a grid) rendered by `render_phantom_imagery.py`, so no chrome tokens act as image data.
- **21.** The licence page lists all seven modules. It shows a 30-day expiry warning (Spectroscopy trial) and states that expiry never blocks existing results (brief §12.7). Activation works offline with a request file and a signed licence file. The System page reports tier, engine, storage encryption and the 8-bit output note. Hardware values are an illustrative clinical-desktop machine.
- **22.** Audit entries are this session's actions. The hash chain shows as verified, and export to ATNA syslog is provided. Collect diagnostics states what is included, says that no images or identifiers are included, and shows progress with Cancel.
- **23.** Report pages use the new print tokens only inside `.paper`. The page fits the preview ("Fit page"). Each report carries site, patient and study identifiers, key images with LUT bars, tables, a graph (DSC), a method summary, version and timestamp (brief §12.6). The Mismatch report states the decision-support limit and "Registration not reviewed" (MM-011, SAFE-070). The institution reads "Demonstration site", because no site is configured.
- **Design-system fix:** accent blue had leaked into graph data (fMRI paradigm shading, ADV fit line); both now use neutral tokens, as DESIGN.md requires.

## Batch 8

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 24 Laptop DSC (panel collapsed) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 24 Laptop DSC (panel overlay) | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **Laptop.** Rendered at 1280 × 720 CSS px with device scale 1.5 (1920 × 1080 physical), using the `nm-viewport` meta that `pnpm design:render` reads. Below 1600 px the task panel and inspector become overlays (brief §4.4). The layout starts at 1×2, and the four viewport roles are one key away (`F6` role pager, law 2). The overlay panel covers part of the viewport only when the user opens it (`Ctrl+B`, law 1 ~). The banner keeps the SAFE-001 fields; modality and accession move to its tooltip. Output buttons become icon buttons with shortcut tooltips. The battery notice is one line in the status bar (brief §12.2).
- **Arabic RTL Directory removed** (2026-11-22): the product is English only, so the RTL variant, its composer and the RTL shell rules were deleted.

## Design review 2026-11-22

### 1. Anatomical brain phantom (all imaging screens)

The disc and stripe phantoms behind the design imagery are replaced by one skull-stripped brain phantom (`scripts/make_phantoms.py --only brain`; spec in `ALGORITHMS.md` §12). Every image, curve, table, ROI and segmentation is computed from it by `render_phantom_imagery.py`. No lesion is painted onto an image any more.

- **Geometry.** 2D series are 128 × 128 at 1.8 mm with 8 slices of 5 mm (DSC, DTI). DCE, permeability and IVIM have 4 slices. fMRI is 64 × 64 at 3 mm, and the 3D FLAIR, SWI and multi-echo series are 128 × 128 × 96 at 1.5 mm. Overlays, slice counters and voxel sizes now match these grids in every screen.
- **Generated, not typed.** The DSC table, ratio table, ROI overlays and ΔR2* graph (03 and its variants 16–18, 23, 24) and the AIF box overlay (04) are now `gen:` regions. So are the mismatch region and volume tables and seeds (05), the DCE and permeability ROIs (07, 08) and the lesion outlines (13). They follow `phantom-data.json`, so a phantom change cannot leave stale numbers.
- **Realistic values shown.** ADC is ≈ 800 in tissue, ≈ 3000 in CSF and 457 in the stroke core. The ROI1/mirror relCBF ratio is 0.49 and MTT 12.1 s against 7.1 s. Perfusion 76.8 ml, core 9.4 ml, mismatch 67.4 ml. The tumour has rim Ktrans 0.12 min⁻¹. The fMRI clusters lie in the left motor and parietal cortex.
- **AIF quality check (04) now comes from the data.** The automatic box sits on the left MCA branch. Its 6-voxel average peaks only 1.9 × above tissue (partial volume), so the check warns on peak height rather than timing; the timing check passes (AIF peaks 3.0 s before tissue).
- **DCE ROI3 (white matter) does not enhance.** T0 and the fitted parameters show "—", as `ALGORITHMS.md` §0.1 now defines for curves that never reach a 20 % rise.
- **Tractography (10).** Bundles are the corpus callosum (R–L) and a left posterior A–P bundle. The notice explains that left corticospinal seeds give no fibers because the tract runs through-plane on 5 mm slices.
- **Law check.** No layout changed; all ten laws keep their previous marks. Smaller ROIs on the 128-matrix (DCE rim ROI 10 voxels) are still legible because outlines are 2 px and labelled.

### 2. DSC units follow the method (DSC-017)

- **03, 02, 16–18, 23, 24.** These screens run Model-free, so relCBV and relCBF are relative: a.u. in the table columns, ratio rows, map overlay, window, colour bar (relCBV 0–150, relCBF 0–20 a.u.) and the Generate series list. The region table header says "Model-free · relative units (a.u.)", so the unit change is explained where the numbers are. MTT, TTP and T0 stay in seconds.
- **04, 05.** Manual AIF with deconvolution: these are the only places where ml/100 g and ml/100 g/min may appear.
- **17 Settings.** LUT defaults list relCBV and relCBF twice: Manual AIF (0–8 ml/100 g, 0–80 ml/100 g/min) and other methods (0 to the 99th percentile, a.u.).
- **23 DSC report.** The table, key-image captions and colour bars use a.u. The method line now says that model-free values are relative and that ml/100 g needs Manual AIF deconvolution.
- **Law check.** Law 4 (units, map name, LUT bar, window) is now correct per method; all other marks are unchanged.
