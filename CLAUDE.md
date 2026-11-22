# CLAUDE.md — NeuroMR-PRO project memory

The full brief is `docs/PROMPT.md` (Part B). The source of truth for behaviour is `docs/spec/FUNCTIONAL_SPEC.md` (requirement IDs) and for maths `docs/spec/ALGORITHMS.md`. Read both before changing code. The vendor manual is **not** in the repo and is not needed after Phase 0.

## Non-negotiable rules (brief §2, condensed)
1. Spec before code. New behaviour gets a requirement ID in `FUNCTIONAL_SPEC.md` first.
2. Original identity: product name NeuroMR-PRO; never use the reference manual's vendor, product or feature names, icons, screenshots, or wording. Use: Tractography, Spectroscopy, change-map subtraction fusion, Stroke LUT.
3. No regulatory claims in the UI ("FDA cleared", "CE marked", "research use only" are all banned). Safety notices are contextual, one sentence, actionable.
4. No placeholders: no TODO, lorem ipsum, "coming soon", or fake results. A package appears in the UI only from the phase that delivers it (`packages/packages-neuro/src/catalog.ts`).
5. Phase gates: full tests, run the app, screenshot new screens and compare with `design/screens/`, fix, commit, push, phase report, update the handoff below. Stop at a clean commit when context runs low.
6. Numerical correctness first: every map passes its phantom gate (`ALGORITHMS.md`) before its UI is done.
7. Conventional commits, one logical change each, push to `claude/new-session-eartr5` after every commit. Never commit DICOM patient data, `data/`, or `docs/reference/`.

## Stack (brief §7)
Electron LTS + TypeScript strict + Vite; React 19, Zustand, TanStack Table, Radix UI (styled only with tokens), uPlot; Cornerstone3D, dicom-parser, dcmjs, VTK.js; Python 3.12 engine (FastAPI on 127.0.0.1 with per-session token, WebSocket progress, cancellable jobs) using numpy, scipy, numba, SimpleITK, ANTsPy, DIPY, nilearn, scikit-image, highdicom, pynetdicom; SQLite (better-sqlite3); Windows MSI (WiX), PyInstaller onedir. Heavy maths never on the renderer main thread. Every IPC message validated with zod (`packages/contracts`). Design tokens only — the ESLint rule `no-restricted-syntax` blocks raw colours/px/font names outside `packages/ui/src/tokens/` and `packages/viewer/src/luts/`.

## Enterprise and regulatory (brief §12–13, summary)
Windows 10 22H2/11 x64 incl. LTSC; fully offline; hardware tiers (minimum, laptop, clinical desktop, diagnostic station); per-monitor DPI, multi-window with display profiles and hanging protocols; roles and SSO/OIDC/local sign-in; auto-lock; hash-chained audit with ATNA export; AES-256-GCM cache with DPAPI key; TLS everywhere; licensing modules (Core, Perfusion, Diffusion, Stroke, Neurosurgery, Spectroscopy, Follow-up) with offline Ed25519 activation, never locking users out of existing results; ICU i18n, English then Arabic and Kurdish (RTL chrome, viewports never mirror). IEC 62304 class B; DHF in `docs/dhf/` (SDP, SOUP, risk, traceability). No GPL/AGPL in the product.

## Environment notes
- Cloud sessions are Linux. Windows-only work (MSI, signing, DPAPI, services, DPI v2) is written here and verified in a `windows-latest` CI job.
- Electron/Playwright tests need `xvfb-run` on Linux.
- Open Design is reachable only on the user's machine; otherwise use the in-repo design path (`docs/PROMPT.md` §3.9).
- If a public-data download is blocked, use the phantoms and report the host.

## Commands
```bash
pnpm install                     # Node workspace
pnpm lint && pnpm typecheck && pnpm test
cd engine && uv sync             # Python 3.12 engine env
uv run --project engine pytest engine/tests
uv run --project engine ruff check engine scripts
pnpm phantoms                    # writes synthetic DICOM + truth.npz to data/phantoms/
pnpm trace                       # regenerates docs/dhf/TRACEABILITY.md
```
CI: `.github/workflows/ci.yml` (node, engine, traceability with `CURRENT_PHASE`, compliance: licences, audits, SBOM).

## Repository map
`engine/` Python engine (phantoms, DICOM writer, algorithm packages) · `packages/contracts` zod schemas · `packages/workspace` launcher validity rules (DIR-004) · `packages/viewer` LUTs and palettes · `packages/ui` contrast utility (tokens arrive in Phase 1) · `packages/packages-neuro` package catalog and licence modules · `scripts/` phantoms, traceability, licence check · `docs/spec`, `docs/dhf`.

---

## Handoff

**Phase status:** Phase 0 (Foundation) complete. Phase 1 (Design) in progress in Open Design (project **NeuroMR-PRO**, design system `neuromr-pro`); batches 1–3 committed.

**Done in Phase 1 so far**
- Batch 1: `design/BRIEF.md`, design system `design/design-system/` (DESIGN.md, tokens.css, manifest), tokens exported to `packages/ui/src/tokens/` with tests, phantom imagery (`design/tools/render_phantom_imagery.py` → `design/assets/img`, `assets/data/phantom-data.json`), Playwright PNG export (`pnpm design:render`), shared `design/screens/shell.css`, screens 02 Workspace shell and 03 DSC Perfusion.
- Batch 2: 04 Define AIF, 05 Mismatch 2×2 and 2×3, 06 Co-registration; `design/screens/icons.svg` (single-source sprite), `design/tools/inject_plots.py` (draws every curve from `phantom-data.json` into `<!-- gen:NAME -->` regions and inlines the sprite), `design/CRITIQUE.md` (§4.6 pass per screen). Spec: REG workspace also serves Longitudinal (LBA-012).
- Batch 3: 01 Study Directory, 07 DCE / T1 Perfusion, 08 Permeability, 09 Diffusion (1×1, 2×2). `inject_plots.py` now also generates the top bar (`gen:topbar`), rail (`gen:rail-<activity>`) and status bar (`gen:statusbar[-<state>]`). Spec: PERM-012, DIF-012 task guidance; `FA_DIRECTION_PALETTE` in the viewer LUT module.
- Workflow: screens are written in `design/screens/`, mirrored into the Open Design project (`…/open-design/.od/projects/neuromr-pro/screens/`), rendered at 1920×1080 and 2560×1440, self-critiqued against brief §4.6.

**Phase 1 batches remaining:** 4 Tractography, fMRI, Spectroscopy · 5 Longitudinal, Advanced Diffusion, Subtraction/Echo Accumulation · 6 dialogs (Generate Series, Save Tables, layouts, settings, shortcuts), states · 7 sign-in/lock, multi-monitor, licence/system, audit/diagnostics, PDF reports · 8 laptop and RTL variants, `design/COMPONENTS.md`.

**Done in Phase 0**
- Manual chapters read (General, T1, T2*/Mismatch, Permeability, Diffusion, fiber tracking, Brain Function, spectroscopy, Longitudinal, Subtraction, Echo Accumulation, Advanced Diffusion); spec and algorithms written in original wording.
- Monorepo scaffold, CI, phantom generator (DSC incl. leakage, DCE semi-quant, Tofts + VFA, DTI 6–64 dirs, multishell, IVIM/DKI, fMRI block, SVS FID, FLAIR follow-up pair), DHF skeleton.

**Open issues**
- Brief §4.2 says tertiary text is "≥ 4.98:1" on the raised surface; exact value is 4.977:1 (passes 4.5:1). Test asserts 4.98 to two decimals.
- oSVD CBF tolerance curve and IVIM/DKI gates in `ALGORITHMS.md` are marked provisional until Phase 3/10 phantom studies.
- Spectroscopy phantom is written as `fid.npz` (no DICOM MR Spectroscopy writer yet; due Phase 8).
- `apps/desktop` (Electron) is created in Phase 2a.
- Open Design MCP is not reachable from cloud sessions.
- DIR-004 rules in `packages/workspace/src/validity.ts` check dynamics only, so a DSC series is reported valid for DCE, Brain Function and Subtraction; the rules should use DIR-003 series types. Awaiting Diyar's decision (found in Phase 1 batch 3).
- Local tooling: `uv` is not on PATH on Diyar's PC; the system Python 3.14 (`/c/Python314/python`) has numpy/scipy/pydicom/Pillow and runs `design/tools/*.py`. Run `inject_plots.py` after editing any screen with `gen:` regions, then `pnpm design:render <filter>`, then copy changed files into the Open Design project folder.

**Exact next step:** Phase 1 batch 4 — screens 10 Tractography, 11 Brain Function / fMRI (incl. Paradigm Editor), 12 Spectroscopy, on `shell.css` and the `neuromr-pro` tokens; render, critique, commit, push; then the next batch. When all screens are done, mark the design "draft – awaiting Diyar's approval" (do not lock, do not start Phase 2 until Diyar writes "design approved").
