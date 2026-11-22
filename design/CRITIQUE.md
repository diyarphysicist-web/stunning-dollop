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
