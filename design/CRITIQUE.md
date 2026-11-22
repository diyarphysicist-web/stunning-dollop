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
- **Finding (spec/code, not design):** the current rules mark DCE / T1 Perfusion, Brain Function and Subtraction valid for a DSC series, because `validity.ts` checks dynamics only, not contrast or series type. DIR-003 already classifies series types; DIR-004 should use them (T1-weighted for DCE, BOLD for Brain Function). The screen shows today's rule outcome, unchanged. Raised as an open issue for Diyar.
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
| 14 Advanced Diffusion (Analyze signal) | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 14 Advanced Diffusion (Computed DWI) | ✓ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 Subtraction | ✓ | ~ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 15 Echo Accumulation | ✓ | ~ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Notes
- **13 Longitudinal.** Uses the two real FLAIR studies (2026-01-01, 2026-07-01). Lesions are detected (threshold 1.5 × median tissue, connected components) and matched by centroid in `render_phantom_imagery.py`. Their volumes equal the phantom truth voxel for voxel: L1 0.123 → 0.257 ml, L2 new, L3 0.257 → 0.123 ml, L4 stable, L5 disappeared; total 0.584 → 0.626 ml. The package is mode-driven (LBA-020…025) rather than step-driven, so laws 2 and 3 apply in adapted form (~): modes, findings and segmentation take the place of steps. The lesion properties dialog is anchored in the inspector (law 1). FLAIR* is shown disabled with its reason, because no SWI/EPI phantom exists; a FLAIR* working-state screen needs that phantom. Compare mode shows the LBA-024 traffic light (green, matching series) and the change-map notice.
- **14 Advanced Diffusion.** Analyze signal fits kurtosis + simplified IVIM to the phantom ROI with the ADV-007 thresholds (b between 0 and 100 s/mm² excluded): D 1112 ×10⁻⁶ mm²/s, f 6.4 %, K 0.71, R² 0.9998, NRMSE 0.38 % of S0. Excluded b-values are drawn as hollow points on the graph. Computed DWI uses its 1×2 layout (ADV-002).
- **15 Subtraction / Echo Accumulation.** Compact single-task workspaces (law 2 ~, no steps). Subtraction shows the SUB-008 geometry check as passed, and the division-by-zero count in the status line (SUB-009). The Echo Accumulation imagery is **design-only**: no multi-echo phantom exists, so the renderer decays the baseline FLAIR slice over four TEs (documented in its docstring). A multi-echo phantom should be added to `scripts/make_phantoms.py` before Phase 10.
