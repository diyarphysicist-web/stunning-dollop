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
