# Risk management file — initial hazard analysis (ISO 14971)

Status: Phase 0 baseline. Severity (S) 1 negligible … 5 catastrophic; probability (P) 1 improbable … 5 frequent; risk = S × P before controls. Controls are requirement IDs from `FUNCTIONAL_SPEC.md`; each control is verified by the tests that reference the ID (`TRACEABILITY.md`). Residual risk is assessed when the owning phase completes.

| ID | Hazard / hazardous situation | Possible harm | S | P | Risk | Risk controls (requirements) | Verification |
|---|---|---|---|---|---|---|---|
| H-01 | Wrong patient: series of two patients combined, or results filed to the wrong patient | Wrong diagnosis or treatment | 5 | 2 | 10 | SAFE-001, SAFE-010, SAFE-020, SAFE-021, GEN-162, GEN-192 | validity tests, export tests (Phase 2) |
| H-02 | Wrong side: left/right confusion after mirror/flip/rotate or RTL layout | Wrong-side surgery or intervention | 5 | 2 | 10 | SAFE-040, GEN-130, brief §12.8 (viewports never mirror in RTL) | viewer orientation tests (Phase 2) |
| H-03 | Wrong map scaling or units (e.g. ml/100 g vs relative, s vs min) | Misclassification of tissue viability or tumour grade | 4 | 3 | 12 | SAFE-050, GEN-112, GEN-141, GEN-160 (rescale and units in DICOM) | per-package unit tests |
| H-04 | Failed or poor registration presented as valid (mismatch, tractography, fMRI, longitudinal) | Wrong mismatch volume, misplaced tract or activation in surgical planning | 4 | 3 | 12 | REG-001…006, SAFE-070, MM-002, TRK-015, FMRI-002, LBA-010, LBA-024 | registration phantom tests (Phase 4) |
| H-05 | Stale result shown after inputs changed | Decision on outdated numbers | 4 | 3 | 12 | SAFE-030, GEN-031 | state-invalidation tests (Phase 2) |
| H-06 | Wrong AIF (partial volume, vein, motion) | Systematic CBF/CBV or Ktrans error | 4 | 3 | 12 | DSC-020…024 (warnings and automatic AIF quality check), PERM-009, SAFE-060 | AIF quality tests (Phase 3) |
| H-07 | Quantitative algorithm error (fit bias, wrong formula) | Wrong grading or extent | 4 | 2 | 8 | Phantom gates DCE-007, DSC-031/032, PERM-011, DIF-010, FMRI-015, MRS-014, LBA-043, ADV-012 | phantom gates in CI |
| H-08 | Mismatch output used as stand-alone stroke treatment selector | Inappropriate treatment allocation | 5 | 2 | 10 | MM-011 persistent notice; report method summary; SAFE-080 | UI test (Phase 4) |
| H-09 | Spurious or missing tracts due to loose thresholds or low SNR | Damage to eloquent white matter in surgery | 5 | 2 | 10 | TRK-006 defaults, TRK-007 warnings, TRK-015 limitations notice | tracking phantom (Phase 6) |
| H-10 | False or missed fMRI activation (wrong paradigm, motion) | Resection of eloquent cortex | 5 | 2 | 10 | FMRI-009, FMRI-012, FMRI-013, FMRI-015 | GLM phantom (Phase 7) |
| H-11 | Change map highlights artefact as disease, or misses change | Wrong follow-up decision | 3 | 3 | 9 | LBA-023, LBA-024 notices and traffic light | change-map phantom (Phase 9) |
| H-12 | Smoothing, thresholds or skipped dynamics silently alter results | Non-comparable follow-up values | 3 | 3 | 9 | GEN-062, SAFE-060, DSC-005 | flagging tests (Phase 2/3) |
| H-13 | Low-resolution underlay misleads localisation | Mis-localisation | 3 | 2 | 6 | GEN-074, GEN-082 | notice tests (Phase 2) |
| H-14 | Corrupt DICOM silently skipped or misread | Missing slices, wrong geometry | 4 | 2 | 8 | DIR-006, GEN-191 | import tests (Phase 2) |
| H-15 | Engine crash loses ROIs/AIF so the user redoes analysis hastily | Rushed, erroneous analysis | 2 | 3 | 6 | GEN-180, GEN-181, brief §11 robustness (auto-restart and restore) | crash-restore test (Phase 2) |
| H-16 | Unauthorised access or tampering with results or audit trail | Privacy breach, undetected alteration | 4 | 2 | 8 | Brief §12.4 (roles, hash-chained audit, AES-256-GCM cache, TLS) | security tests (Phase 2b), `SECURITY.md` |
| H-17 | Expired licence blocks access to existing results | Delayed care | 3 | 2 | 6 | Brief §12.7 expiry rule (viewing and export always allowed) | licensing tests (Phase 2b) |
