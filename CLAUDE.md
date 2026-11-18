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

**Phase status:** Phase 0 (Foundation) complete. Phase 1 (Design) not started.

**Done in Phase 0**
- Manual chapters read (General, T1, T2*/Mismatch, Permeability, Diffusion, fiber tracking, Brain Function, spectroscopy, Longitudinal, Subtraction, Echo Accumulation, Advanced Diffusion); spec and algorithms written in original wording.
- Monorepo scaffold, CI, phantom generator (DSC incl. leakage, DCE semi-quant, Tofts + VFA, DTI 6–64 dirs, multishell, IVIM/DKI, fMRI block, SVS FID, FLAIR follow-up pair), DHF skeleton.

**Open issues**
- Brief §4.2 says tertiary text is "≥ 4.98:1" on the raised surface; exact value is 4.977:1 (passes 4.5:1). Test asserts 4.98 to two decimals.
- oSVD CBF tolerance curve and IVIM/DKI gates in `ALGORITHMS.md` are marked provisional until Phase 3/10 phantom studies.
- Spectroscopy phantom is written as `fid.npz` (no DICOM MR Spectroscopy writer yet; due Phase 8).
- `apps/desktop` (Electron) is created in Phase 2a.
- Open Design MCP is not reachable from cloud sessions.

**Exact next step:** Phase 1. Check for Open Design MCP tools; if absent, follow `docs/PROMPT.md` §3.9: write `design/BRIEF.md` and `design/DESIGN.md` from brief §4–5, export `packages/ui/src/tokens/tokens.css` and `tokens.ts` (replace the literals in `packages/ui/src/contrast.test.ts` with token imports), build the §5.2 screens as token-only HTML in `design/screens/` with grayscale imagery rendered from `data/phantoms/`, render PNGs with Playwright (1920×1080 and 2560×1440), self-critique against §4.6, write `design/COMPONENTS.md`, commit, push, report.
