# NeuroMR-PRO — Master Build Prompt for Claude Code (cloud + optional Open Design)

---

## PART A — One-time setup

The repository already exists on GitHub (`diyarphysicist-web/stunning-dollop`). Do **not** run `mkdir` / `git init`.

### A1. Cloud session (claude.ai/code) — used for Phase 0 and Phases 2–12
1. Start a session on this repository.
2. Upload the manual PDF into the session at the start of Phase 0 (it is never committed; see §2 rule 7).
3. Paste Part B as the first message.

### A2. Local machine (only if you want Open Design for Phase 1)
Open Design runs as a local daemon and cannot be reached from a cloud container.

```bash
git clone https://github.com/diyarphysicist-web/stunning-dollop.git
```

```bash
cd stunning-dollop && mkdir -p docs/reference
```

```bash
cp "/path/to/MR Apps IFU.pdf" docs/reference/MR_Apps_IFU.pdf
```

```bash
od mcp install claude
```

```bash
npx -y skills add nexu-io/open-design --skill design-md --agent claude-code
npx -y skills add nexu-io/open-design --skill design-brief --agent claude-code
npx -y skills add nexu-io/open-design --skill high-end-visual-design --agent claude-code
npx -y skills add nexu-io/open-design --skill web-design-guidelines --agent claude-code
```

Keep the Open Design app running, create an empty project named `NeuroMR-PRO`, then run `claude` in the repo and say: "Resume from CLAUDE.md; run Phase 1."

---

## PART B — The prompt (paste into Claude Code)

You are the lead engineer and lead product designer for **NeuroMR-PRO**, a professional neuro-MRI post-processing workstation. You have 20+ years of combined experience in MR physics, DICOM imaging software, and clinical workstation UX (the class of software radiologists use 8 hours a day in a dark reading room). You build production code, not demos.

### 1. Mission

Build NeuroMR-PRO: a desktop application that loads neuro MR DICOM studies and runs a full suite of quantitative neuro analysis packages — DSC perfusion, DCE/T1 perfusion, permeability, diffusion/DTI, fiber tracking, fMRI, MR spectroscopy, longitudinal lesion follow-up, advanced diffusion (IVIM/kurtosis), subtraction, and echo accumulation — with a polished, consistent, clinician-grade UI/UX.

The functional reference is `docs/reference/MR_Apps_IFU.pdf` (392 pages). It is the instructions-for-use manual of an existing commercial MR applications suite. Use it as the **functional and workflow specification**: what each package does, its inputs, task-guidance steps, viewports, toolbar functions, right-click menus, algorithms, result parameters, defaults, and accuracy targets.

**All UI/UX design is produced design-first.** Preferred tool: Open Design (MCP server + skills, local machine only, see Part A2). If Open Design is not reachable (always the case in a cloud session), use the in-repo design path in §3.9. Either way, you never hand-invent the visual design inside React files: the design system and screen designs exist first, and code implements them faithfully.

### 2. Non-negotiable rules

1. **Read before you build.** Before writing any code, read the neuro chapters of the manual listed in §6 and the "General information" chapter (pages 15–22). The manual is not in the repository: in a cloud session it is uploaded by the user; copy it to `docs/reference/MR_Apps_IFU.pdf` (git-ignored). If it is missing, stop and ask for it. Install `poppler-utils` if `pdftotext` is absent. Extract the text first (`pdftotext -layout -f <first> -l <last>` per chapter into git-ignored `docs/reference/text/`) and read those files; open PDF pages as images only for figures and screen layouts. Write a condensed functional spec to `docs/spec/FUNCTIONAL_SPEC.md` in your own words, organized by package. That spec becomes your source of truth: later sessions work from `FUNCTIONAL_SPEC.md` and `ALGORITHMS.md` alone and do not need the PDF.
2. **Original identity.** NeuroMR-PRO has its own name, logo, icon set, color system, and copy. Never reproduce the manual's vendor names, logos, product names, screenshots, icons, or verbatim text in the product. Rewrite all UI strings and help text in original wording. The manual's trademarked package and feature names map to NeuroMR-PRO names as follows, in code, folders, UI and docs: fiber tracking package → **Tractography**, spectroscopy package → **Spectroscopy**, the manual's subtraction-fusion mode → **change-map subtraction fusion**. Generic technique names from the literature (DSC, DCE, IVIM, FLAIR*, oSVD) are fine. Algorithms, physics formulas, and parameter definitions are implemented from the literature cited in the manual.
3. **No regulatory claims in the UI.** Do not write "FDA cleared", "CE marked", or similar anywhere in the product. Do not add "research use only" banners either. Clinical safety warnings that matter to correct use (e.g. AIF quality, motion, registration verification, tractography limitations) appear contextually where the action happens, in concise original wording.
4. **No placeholders.** No `TODO`, no lorem ipsum, no mocked "coming soon" panels, no hard-coded fake results. If a feature is in the current phase, it works end to end on real DICOM data. If it is in a later phase, it does not appear in the UI yet.
5. **Phase gates.** Work in the phases in §10. At the end of each phase: run the full test suite, run the app, take screenshots of every new screen, compare them against the locked design screens in `design/screens/`, fix deviations, commit, push, and post a short phase report (what was built, test results, screenshots path, known limits). Then continue to the next phase without waiting unless something is blocked. Before moving on, update `CLAUDE.md` with a handoff block (phase status, open issues, exact next step) so a fresh session can resume from it alone; when your context is getting full, finish the current commit, write the handoff, and stop rather than continuing half-informed.
6. **Numerical correctness beats visual polish.** Every quantitative map is validated against a synthetic digital phantom with known ground truth before its UI is considered done (§11).
7. **Commit discipline.** Conventional commits, one logical change per commit, push to `claude/new-session-eartr5` after every commit (cloud containers are deleted when a session ends; unpushed work is lost), never commit DICOM patient data. Test data is synthetic or fully anonymized public datasets downloaded by a script into a git-ignored folder. `docs/reference/` is git-ignored too: the vendor manual is a local reference and never gets pushed.

### 3. Design workflow (mandatory, Phase 1)

Run this sequence through the Open Design MCP tools before any frontend code exists (or §3.9 when Open Design is unreachable):

1. **Verify the connection.** List Open Design projects, confirm the active project is `NeuroMR-PRO`, and read back one file from it. If the MCP server is not reachable, say so in one line and follow §3.9 instead of steps 2–8 below. Do not stop.
2. **Design brief.** Using the `design-brief` skill, write `design/BRIEF.md` from §4 and §5 below: users, environment (dark reading room and also bright offices and operating-room planning; laptops through multi-monitor diagnostic stations, 1366×768 to 8K, landscape and portrait, mixed DPI — see §12.2–12.3), user roles (§12.4), density requirements, keyboard-first operation, and the full screen inventory from §5.
3. **Design system.** Using the `design-md` skill, create `design-systems/neuromr-pro/DESIGN.md` in the Open Design project implementing the tokens in §4. Select it as the project's active design system.
4. **Screen generation.** Generate every screen in §5.2 as high-fidelity desktop prototypes in Open Design, using the NeuroMR-PRO design system, with realistic content (real map names, real parameter names and units, plausible values, real DICOM tag names). Use grayscale brain-slice imagery rendered from synthetic data, never stock photos.
5. **Self-critique pass.** For each screen, check against §4.6 (UX laws for clinical workstations). Revise in Open Design until every check passes. Export each screen as HTML plus PNG into `design/screens/`.
6. **Token export.** Export the design system to `packages/ui/src/tokens/tokens.css` (CSS custom properties) and `packages/ui/src/tokens/tokens.ts`. The React component library consumes only these tokens — no raw hex values, pixel sizes, or font names anywhere else in the codebase (enforce with a lint rule). Data colors are exempt only in one place: LUT tables and the ROI/mismatch palettes live as data in `packages/viewer/src/luts/` and are imported from there.
7. **Component inventory.** From the exported screens, derive `design/COMPONENTS.md`: every reusable component, its variants, states (default, hover, active, focused, disabled, busy, error), and keyboard behavior.
8. **Design lock.** Commit `design/` and post the screen PNGs in the phase report. Later phases may add screens through the same design path and system; they never bypass it.

Whenever a later phase needs a new dialog or panel, design it first (Open Design or §3.9), export it, then implement.

9. **In-repo design path (fallback when Open Design is unreachable).** Produce the same outputs, at the same paths, without Open Design:
   - `design/BRIEF.md` and `design/DESIGN.md` written from §4 and §5.
   - `packages/ui/src/tokens/tokens.css` and `tokens.ts` written directly from §4, with the contrast unit test.
   - Every §5.2 screen as a static HTML/CSS prototype in `design/screens/<nn>-<name>.html` that uses only the tokens, with grayscale brain imagery rendered from the synthetic phantoms (§9).
   - PNG for each screen rendered with Playwright at 1920×1080 @1x and 2560×1440 @1x into `design/screens/`.
   - The self-critique pass (step 5), `design/COMPONENTS.md` (step 7), and the design lock (step 8) as written above.
   If Open Design becomes available later, import `design/DESIGN.md` into it as the active design system; the exported files stay the contract code is built against.

### 4. Design system specification (input to DESIGN.md)

#### 4.1 Visual direction
"Quiet instrument." A near-black, low-luminance workspace where the images are the brightest thing on screen. Chrome recedes; data, maps, and curves come forward. Precise, calm, dense, engineered — closer to an oscilloscope or flight deck than to a consumer app. No gradients on chrome, no glassmorphism, no decorative illustration, no emoji.

#### 4.2 Color
- Viewport background: pure `#000000`. Viewport chrome never tints image pixels.
- App background `#0B0D10`; panel surface `#12151A`; raised surface `#181C22`; hairline borders `#232830`; focus ring `#4DA3FF`.
- Text: primary `#E6E9EE`, secondary `#9AA3AF`, tertiary `#838B98`. Minimum contrast 4.5:1 for all text on its surface (verified: tertiary ≥ 4.98:1 on the raised surface; the earlier `#6B7380` failed at 3.57–4.07:1). Add a unit test that checks every text/surface token pair.
- Single accent `#4DA3FF` (interactive, selection, active tool). Semantic: success `#3CCB7F`, warning `#F2B441`, critical `#FF5A5F`, info `#4DA3FF`.
- ROI palette: 8 distinguishable colors safe for color-vision deficiency, assigned in order to ROI1…ROI8 and reused identically in viewports, table rows, and graph curves.
- Mismatch/penumbra overlays: diffusion core and perfusion deficit each get a dedicated, colorblind-safe pair; penumbra is their difference with hatching option.
- Map LUTs (data, not chrome): Gray, Blue-to-Red, Stroke LUT (black → light blue → green → yellow/orange → red), plus Hot, Jet-free perceptual (viridis family) for fMRI/statistics. Every color map shows a vertical color bar with min/max values and units.

#### 4.3 Typography
- UI: Inter (fallback system-ui), 13 px base, 12 px dense tables, 11 px viewport overlays, 16 px panel titles. Tabular numerals everywhere numbers appear.
- Data/mono: JetBrains Mono for DICOM tags, coordinates, and numeric readouts.
- Viewport overlay text uses a 1 px black text-shadow for legibility on bright pixels.

#### 4.4 Layout grid and density
- 4 px base spacing unit. Panel padding 12 px. Row height 28 px (default) / 24 px (dense).
- Shell: 48 px top bar (patient banner + global actions), 56 px left activity rail, 300 px task-guidance panel (collapsible to 0), toolbar 40 px above the viewport grid, viewport grid fills remaining space, optional 280 px right inspector. Below 1600 px window width the task panel and inspector become overlays; at ≥ 3840 px the inspector is open by default. All sizes are CSS pixels and scale with display DPI (§12.3).
- Viewport grid layouts: 1×1, 1×2, 2×1, 2×2 (default for analysis packages), 2×3, 3×3, plus user-saved presets.

#### 4.5 Iconography and motion
- Original 20 px outline icon set, 1.5 px stroke, consistent metaphors; every icon has a tooltip with its keyboard shortcut.
- Motion: 120 ms ease-out for panels, 0 ms for anything inside a viewport. Never animate image data.

#### 4.6 UX laws for this product (every screen must pass)
1. The image is never covered by a modal unless the user asked for it; dialogs that need image interaction (Define AIF, co-registration review) are full workspaces, not small popups.
2. Every analysis package follows the same skeleton: task-guidance steps on the left, toolbar on top, 2×2 viewports by default (source, live maps, table/anatomical, graph/anatomical); the laptop tier (§12.2) may start in 1×2 with the same four viewport roles reachable by one key. Learning one package teaches all of them.
3. Task-guidance steps are numbered, show completion state, and can be revisited in any order once prerequisites are met.
4. Every number shown has a unit. Every map shows its name, units, LUT bar, and window range.
5. Every slow operation (>300 ms) shows progress with cancel; the UI thread never blocks.
6. All primary actions are reachable by keyboard; shortcuts are discoverable (`?` opens the shortcut sheet).
7. Right-click context menus exist on every viewport, table, and graph, and mirror toolbar functions — never hide a function only in a context menu.
8. Undo/redo (`Ctrl+Z` / `Ctrl+Y`) for ROIs, segmentation edits, registration edits.
9. State is never lost: bookmarks and session autosave restore ROIs, AIF, thresholds, layout, and selected maps.
10. Warnings are contextual, one sentence, and actionable.

### 5. Information architecture

#### 5.1 Global structure
- **Activity rail:** Directory (study browser), Viewer, Analysis, Results/Reports, Settings.
- **Patient banner:** patient name, ID, sex, age, study date, modality, field strength, accession; always visible in analysis workspaces.
- **Left panel switcher:** Series / Package (task guidance) / Key Images / Bookmarks — one control, four tabs.

#### 5.2 Screen inventory to design (Open Design or §3.9)
1. Study Directory: sources (local folder, DICOM import, PACS node), study list, series list with thumbnails and series-type badges (DSC, DCE, DWI, DTI, fMRI, MRS/SVS, MRS/CSI, FLAIR, T1, T2, SWI), analysis launcher showing which packages are valid for the selected series with reason when invalid (e.g. "needs ≥ 2 b-values").
2. Analysis Workspace shell (generic 2×2 template with all regions labelled).
3. DSC Neuro Perfusion — main analysis state with maps grid, ROI + contralateral mirror ROI, ratio table, curves.
4. Define AIF workspace (7×7 voxel box, per-voxel curve grid, selected curves highlighted, averaged AIF preview).
5. Diffusion–Perfusion Mismatch (2×2 and 2×3 variants; automatic segmentation with seed points, thresholds panel, mismatch volume table, penumbra overlay).
6. Co-registration Review & Edit (three orthogonal fusion views, algorithm selector, translate/rotate nudges, undo/redo/reset, save).
7. DCE / T1 Perfusion (time-intensity curves, bilinear fit overlay, results table).
8. Permeability (injection preset selector, relaxivity / hematocrit inputs, reference flip-angle series selection, Ktrans/kep/ve/vp maps).
9. Diffusion (b-value selector, ADC / eADC / DWI-iso / FA / FA-direction / AD / RD / RA maps, 1×1 and 2×2 map layouts).
10. Tractography (3D main view with orthogonal planes, 3 reference views, fiber-bundle manager tree, bundle settings dialog, guidance panel, fiber statistics).
11. Brain Function / fMRI (paradigm selector, Paradigm Editor wizard — block and event, compute SPMs, T-score thresholds and blending on anatomy).
12. Spectroscopy (reference views with voxel grid, spectrum viewer with fitted baseline, metabolite table, metabolite and ratio maps, quality indicator legend).
13. Longitudinal Brain Analysis (timeline-ordered multi-study hanging, Single / Longitudinal / Compare (subtraction) modes, findings list, lesion properties dialog, lesion-volume trend graph, FLAIR* mode).
14. Advanced Diffusion (cDWI mode and Analyze-signal mode, model selector, b-value thresholds, D / f / D* / K maps).
15. Subtraction and Echo Accumulation (compact single-task workspaces).
16. Generate Series dialog (SC / SC-RGB, name, register-while-saving, map selection) and Save All Tables dialog (CSV/HTML, include graphs, destination).
17. Layout preset manager, Settings (LUT defaults, smoothing defaults, injection presets, data types, display calibration check), and Shortcut sheet.
18. Empty, loading, error, and invalid-input states for the Directory and one analysis package.
19. Sign-in, lock screen, and role-based start view.
20. Multi-monitor setup (display list, diagnostic flag, window roles, hanging-protocol editor by monitor configuration) and the display test-pattern screen.
21. License page (modules, status, offline activation request/response) and Settings → System (hardware tier, GPU, displays, engine location).
22. Audit log viewer (administrator) and Collect diagnostics.
23. PDF report preview for DSC and Mismatch.
24. Laptop variant (1920×1080 @150 %, panels as overlays) of the DSC workspace.

### 6. Functional specification by package (condensed from the manual — read the chapters for full detail)

Manual chapter map (PDF page numbers): General information 15 · T1 Perfusion 23 · T2* Neuro Perfusion 39 (Mismatch inside it) · Permeability 65 · Diffusion 85 · fiber tracking 95 · Brain Function 113 · spectroscopy 127 · Longitudinal Brain Analysis 139 · Subtraction 341 · Echo Accumulation 347 · Advanced Diffusion Analysis 351. Cardiac, Cartilage, and Liver chapters are **out of scope**.

#### 6.0 Shared behavior (all packages)
- **Mouse modes** (selectable from context menu and toolbar): scroll, pan, zoom, window/level, mask threshold, draw ROI, overlay opacity (maps only). Resets: zoom/pan, windowing, all (also clears graphics).
- **Scrolling:** series with one image attribute → horizontal drag or ←/→ moves slices. Two attributes (slice × dynamic/phase/echo/b-value) → vertical drag = slices, horizontal drag = second attribute. Map viewport: horizontal drag cycles maps.
- **ROIs:** spline contour (click points, double-click to close), ellipse (two clicks width, one click height), freehand (drag, auto-close). Editable anchors, drag to move, double-click name to rename, duplicate names get numeric suffix, delete via context menu, `Ctrl+Z` removes last ROI. Results appear immediately on ROI confirmation.
- **Contralateral mirroring:** draggable vertical mirror line; optional auto-creation of a linked mirrored ROI; lesion/reference ratios in the table. **Reference ROI:** one ROI can be declared reference ("-ref" suffix); ratio table recomputes against it; mirrored pairs are excluded from reference ratios unless unlinked.
- **Mask:** intensity threshold slider (and right-drag) excludes background voxels; excluded voxels shown in a mask tint.
- **Smoothing:** spatial None/Weak/Medium/Strong = kernel 1, 3×3, 5×5, 7×7; temporal None/Weak/Medium/Strong = uniform filter width 1, 3, 5, 7 dynamics. Smoothing affects numerical results and must say so in the tooltip.
- **Underlay:** None / Source / Other series (drag-and-drop supported); underlay resampled to overlay geometry; overlay opacity slider. Secondary captures rejected as underlay (no geometry).
- **Anatomical viewer:** any series, auto-reformatted (real-time MPR) to the source orientation; warn when its resolution is low.
- **Follow Mouse:** live per-voxel curve and parameter readout at cursor.
- **Graph viewer:** per-ROI curve toggles, ROI-average toggle, auto-scale, time vs dynamic-number axis, fitted-curve overlay, marker lines for current and reference dynamic.
- **Table viewer:** measurement type = Region parameters (fit the ROI-mean curve; default) or Mean voxel parameters (mean of voxel maps inside ROI); ROI statistics window (max, min, median, mean, SD per parameter); copy to clipboard as TSV.
- **Windowing ROI** on a map: recompute that map's color window to maximize contrast inside the ROI.
- **Viewing tools:** mirror L↔R, flip U↔D, rotate ±90°.
- **Layouts:** system layouts plus user presets (save, delete; system presets undeletable; the active preset cannot be deleted); a saved layout remembers which series sat in which viewer.
- **Generate series:** DICOM Secondary Capture (grayscale maps with LUT burned only in SC-RGB variant), user-named; optional "register data while saving" (motion correction before final map computation, with a note that preview and saved maps may then differ).
- **Export tables:** CSV and HTML, optionally with all graphs as PNG; DICOM SC of the table.
- **Bookmarks:** snapshot of full analysis state, including the reference ROI selection.
- **Incoming series:** "add to running session" from the Directory.
- **Pre-processing gate:** packages cannot open a series until import/pre-processing has finished.

#### 6.1 DCE / T1 Perfusion (semi-quantitative)
- Input: T1w dynamic series, ≥ 4 dynamics. Viewports: source, live maps, subtracted series ↔ table, graph ↔ anatomical.
- Subtraction reference = dynamic 1 by default; context-menu "Set as subtraction reference".
- Maps/parameters: RELENH [%] = (I(D)/I(Dref) − 1)×100; MAXENH = S1 − S0; MAXRELENH [%]; T0 [s] = first time signal exceeds baseline by ≥ 20 %; S0 = mean of pre-uptake points; TTP [s]; WASHIN and WASHOUT (≤ 8 dynamics: max discrete slope over the relevant segment; > 8 dynamics: slopes of a bilinear fit); BREVENH [s] (≤ 8: time between max wash-in and max wash-out points; > 8: between midpoints of the fitted wash-in and wash-out lines); AREACURV.
- Accuracy target: at 5 % image noise, mean bias < 5 %, tolerance 10 %.

#### 6.2 T2* DSC Neuro Perfusion
- Input: T2*/GRE-EPI DSC series. Task guidance: Select maps → Select underlay → Analysis → Generate maps → (optional) Diffusion–Perfusion Mismatch. Optional "Skip dynamics" step for pre-steady-state dynamics.
- Analysis methods:
  - **Gamma variate** fit: relCBV = area under fitted ΔR2* curve; MTT = Σ(Sᵢ·(tᵢ − T0))/ΣSᵢ (first moment measured from bolus arrival, not from scan start); relCBF = relCBV/MTT.
  - **Model-free:** baseline detection at front and tail; MTT = area(S·(t − T0))/area(S); T0, TTP, relCBV (AUC), relCBF = relCBV/MTT.
  - **Manual AIF + deconvolution:** delay-insensitive block-circulant SVD (oSVD, Wu et al. 2003); relCBF [ml/100 g/min], relCBV [ml/100 g]; optional Delay/Tmax map [s].
  - **Leakage correction** (Boxerman–Schmainda–Weisskoff): reference curve = mean of non-enhancing voxels; linear regression fits K1 (bolus scaling, typical 0–2) and K2 [1/min] (leakage, positive under T1 dominance, negative under T2* dominance); outputs relCBVuncorr, relCBVcorr, K1, K2, plus advanced maps R (goodness of fit) and reference-voxel mask.
- **Define AIF workspace:** opens on the middle slice; 7×7 voxel box draggable over an artery; right pane shows the 49 voxel curves; click to include/exclude (selected = highlighted); averaged AIF preview; Apply. Reopenable from the task guidance. Contextual warnings: partial volume, motion, low temporal resolution, slow bolus.
- Accuracy target (digital phantom, SNR 50, temporal resolution 2.1 s): mean bias ≤ 10 % for relCBF and relCBV; ≤ half the temporal resolution for MTT, TTP, T0. For oSVD deconvolution, SVD's known CBF underestimation at short MTT makes a flat 10 % gate unrealistic: gate relCBV at ≤ 10 %, and gate relCBF against the oSVD tolerance curve over MTT 2–12 s documented in `ALGORITHMS.md` (with citation), plus monotonic ordering of phantom CBF levels.
- **Diffusion–Perfusion Mismatch stage:** requires a valid diffusion series; auto-generates ADC-iso/eADC-iso when only DWI/DTI exist; registers perfusion dynamic 1 to the diffusion b0 (local correlation default); linked position/zoom/pan between diffusion and perfusion viewers; Review & edit co-registration (Normalized Mutual Information initial alignment, algorithm selector, translate/rotate nudges and free tools, undo/redo/reset, save).
  - Manual mode: diffusion ROI and perfusion ROI, propagated across all linked series → area results.
  - Automatic mode: seed point on ADC map and on Tmax/Delay map; threshold region growing with editable thresholds (the manual does not state values; use ADC < 620 × 10⁻⁶ mm²/s and Tmax > 6 s as NeuroMR-PRO defaults, configurable in Settings); re-segment; add seeds; erase with exclusion ROI → volume results.
  - Results: penumbra overlay in anatomical viewers (optional fill), Table 1 per-region details incl. ADC, Table 2 mismatch volume and ratio = (perfusion − diffusion)/perfusion [%]; signal plots for deficits; segmentation opacity per viewport.
  - Contextual notice: decision support only, not a stand-alone treatment-selection tool.

#### 6.3 Permeability (quantitative DCE, Extended Tofts)
- Inputs: DCE series ≥ 20 dynamics; two non-dynamic T1-FFE reference series with different flip angles (default 5° and 15°, identical TR ≈ 10 ms and TE ≈ 2 ms) for variable-flip-angle baseline T1 map.
- AIF: model-based population AIF (bi-exponential, three shapes by injection duration: short < 5 s, medium 5–10 s, long > 10 s) or manual 7×7 AIF as in 6.2.
- Inputs panel: injection preset (editable library in Settings; preset values per field strength and contrast agent), contrast relaxivity [s⁻¹·mmol⁻¹·L], dose [mmol/kg], hematocrit (default 45 %). Warning: verify preset matches the actual injection.
- Outputs: Ktrans [min⁻¹], kep [min⁻¹], ve = Ktrans/kep, vp, iAUC; optional T1 and Delay maps.

#### 6.4 Diffusion (DWI/DTI)
- Validity: ADC needs ≥ 2 b-values; FA/directional maps need ≥ 6 gradient directions. b-value selector (≥ 2 required).
- Maps: per-direction ADC, ADC-iso [mm²/s], eADC = exp(−b·ADC) and eADC-iso, DWI-iso (from net ADC and b0; not offered for single-direction acquisitions), FA (gray), FA direction (red = RL, green = AP, blue = FH), advanced: axial diffusivity, radial diffusivity, relative anisotropy. ADC/eADC/DWI-iso computed on Generate (no live preview), others live.
- Map layout 1×1 / 2×2, mask, register while saving.

#### 6.5 Tractography (step inside Diffusion)
- Input: DTI with ≥ 6 directions and ≥ 2 b-values.
- Layout: large 3D main view with three orthogonal planes (plane position, pan, zoom, roll/rotate, gray level, threshold, plane opacity) + three reference views on the right; orientation presets; per-plane show/hide.
- Tracking: deterministic streamline tracking with settings Minimum FA, Maximum angle change, Minimum fiber length (the manual gives no numbers; use 0.20, 45°, 10 mm as NeuroMR-PRO defaults; step size 0.5 × the smallest voxel dimension, 1 seed per voxel, trilinear tensor interpolation); warning that loosening thresholds produces spurious tracts.
- Tools: Multi-ROI manual tracking (AND ROIs, NOT/exclude ROIs) and Single-ROI auto tracking; ROI shapes smoothed polygon, ellipse, freehand, seed 2D, seed 3D.
- Bundle manager tree (bundles → ROIs): visibility, rename, color or directional color, edit settings, exclude/include ROI, delete; guidance panel with anatomical hints for common bundles (corticospinal tract, arcuate fasciculus, optic radiation, corpus callosum, IFOF, uncinate).
- Underlay/overlay: anatomical series and fMRI SPMs as overlay.
- Fiber statistics (count, mean length, mean/SD FA and ADC along bundle), hover readout of strand under cursor.
- Save bundles, batch reformats (type, number of images, increment mm, thickness mm), export for surgical navigation as DICOM, with a tractography-limitations notice.

#### 6.6 Brain Function (fMRI)
- Input: BOLD T2* EPI dynamic series (typically ≥ 80 dynamics, TR ≈ 2–3 s).
- Paradigms: Block (seconds or dynamics; sequential/blocks; task/rest blocks with colors; drag to resize), Event (import event file), Resting state (ROI on anatomy defines the reference time course). Paradigm manager: new, edit, copy, delete.
- Steps: review co-registration to anatomy → smoothing width (optional step) → anatomical underlay → select paradigm → compute SPMs (GLM; option "suppress motion-related artifacts" via motion regression, disabled for console-registered series) → analyze SPMs (T-score map, two-handle threshold on the color bar, blending %) → save SPMs. Optional skip-dummy-dynamics step and multi-session series selection.

#### 6.7 Spectroscopy (MRS)
- Inputs: SVS or CSI spectroscopy + reference imaging; anatomy preset (Brain default).
- Reference views with voxel/grid overlay, processing state colors (unprocessed / processing / processed), optional mini-spectra and quality indicator.
- Spectrum viewer: zero-order phase correction (auto and manual), fitted spectrum and fitted baseline toggles, metabolite selection (NAA, Cho, Cr, mI, Glx, Lac, Lip), ppm axis.
- Quality indicator per voxel (green / orange / red) from line width (FWHM of water and of metabolite peaks in ppm) and SNR (largest metabolite peak height / RMS noise).
- Outputs: metabolite table (area, ratio, SNR), metabolite maps and ratio maps (Cho/Cr, NAA/Cr, Cho/NAA) for CSI, save graphs and maps.

#### 6.8 Longitudinal Brain Analysis
- Loads multiple studies of one patient; hanging presets by data type (FLAIR, T1, T2, ADC, DWI, SWI, MR) mapped from DICOM attributes; preset editor (layout, properties, datatype-to-viewport mapping, shared presets).
- Automatic inter-study registration with manual edit (pan, rotate, fine-tune, undo/redo, reset, re-apply).
- Modes: Longitudinal (time-ordered, linked), Single, Compare (side by side) and change-map subtraction fusion (threshold default 10 % of max difference after 2-percentile outlier removal; requires ≥ 1 mm resolution), FLAIR* (3D FLAIR × registered 3D multi-shot EPI/SWI, ≤ 1.5 mm slices) for central-vein-sign review.
- Segmentation: seed-point (adaptive threshold, bright or dark lesions, adjustable limiting sphere), smart ROI balloon; `Shift`+click propagates to other time points with preview; add/remove brush edits; undo/redo.
- Findings: list with status icons, match/unmatch across studies, properties (name, type Lesion/MS lesion/Tumor, location, change New/Increase/Decrease/Stable/Disappeared, comments); results stage with volume-over-time graph and table; export DICOM SC and JPEG/TIFF/BMP.
- Context wheel menu for lesion operations.

#### 6.9 Advanced Diffusion Analysis
- Modes: Computed DWI (cDWI at any user b-value using mono-exponential [2 b], simplified IVIM [≥ 3 b], or bi-exponential [≥ 4 b] model) and Analyze diffusion signal.
- Models and outputs: mono-exponential → D; simplified IVIM → D, f; bi-exponential → D, f, D*; kurtosis (mono-exp, ≥ 3 b) → D, K; kurtosis + simplified IVIM (≥ 4 b) → D, f, K.
- b-value thresholds: IVIM threshold default 100 s/mm², kurtosis threshold default 800 s/mm²; per-model b-value validity rules enforced in the b-value dialog with clear reasons.

#### 6.10 Subtraction
- Operations: S + W·R, S − W·R, relative subtraction (S − W·R)/((S + W·R)/2), ratio S/R, magnetization transfer ratio ((R − W·S)/R)×100. Source/reference series or dynamic selection, swap, range selection, weight factor, mask, generate series.

#### 6.11 Echo Accumulation
- Sum of a user-selected echo range of a multi-echo series; set range, preview, generate series.

### 7. Architecture and stack

Use exactly this stack:

- **Desktop shell:** Electron (latest LTS) + TypeScript (strict) + Vite.
- **UI:** React 19, Zustand for state, TanStack Table for result tables, Radix UI primitives styled only with the exported design tokens, uPlot for curves and graphs (fast, canvas-based).
- **Imaging:** Cornerstone3D (viewports, volume loading, MPR, segmentation, annotation/ROI tools), dicom-parser and dcmjs on the client; VTK.js for the Tractography 3D view and 3D streamline rendering.
- **Compute engine:** Python 3.12 sidecar process launched and supervised by Electron's main process, exposed via FastAPI on a random localhost port with a per-session token; long jobs stream progress over WebSocket and are cancellable.
  - pydicom, numpy, scipy, numba (hot loops), SimpleITK and ANTsPy (registration), DIPY (tensor fitting, IVIM/DKI, deterministic tracking), nilearn (GLM, design matrices, HRF), scikit-image (region growing, morphology), spectroscopy fitting implemented in-house on scipy (linear-combination fit with baseline), highdicom (Secondary Capture and Segmentation object creation).
- **Storage:** local study index in SQLite (better-sqlite3), file cache on disk, analysis sessions and bookmarks as versioned JSON.
- **DICOM I/O:** import from folder/DICOMDIR, DIMSE C-FIND/C-MOVE/C-STORE to a PACS node via pynetdicom, export SC/SC-RGB/SEG back to PACS or folder.
- **Packaging:** Windows 10/11 x64 is the only commercial target: per-machine MSI (WiX, via electron-builder or a WiX project) plus a signed EXE bootstrapper, ADMX/ADML policy templates, all binaries Authenticode-signed (§12.5). Python sidecar frozen with PyInstaller (onedir) and signed. Linux AppImage is a developer build only.
- **Enterprise services:** license server and optional remote compute engine as Windows Services (§12.5, §12.7); auth via Windows SSO / OIDC / local accounts; English UI with every string in one message catalog (§12.8).

Engineering rules: all heavy math in the sidecar or Web Workers, never on the renderer main thread; typed IPC contract shared in `packages/contracts`; every algorithm is a pure function with its own unit tests; structured logging with patient identifiers redacted.

### 8. Repository layout

```
<repo root>/                     (GitHub repo stunning-dollop; product name stays NeuroMR-PRO)
├─ apps/desktop/                 Electron main + preload + renderer bootstrap
├─ packages/ui/                  design tokens, component library (from the design export)
├─ packages/viewer/              Cornerstone3D / VTK.js viewport layer, tools, sync
├─ packages/workspace/           analysis-package shell: task guidance, toolbar, layouts, bookmarks
├─ packages/packages-neuro/      one folder per analysis package (dsc, dce, permeability, diffusion,
│                                tractography, fmri, spectroscopy, longitudinal, adv-diffusion, subtraction, echo)
├─ packages/contracts/           typed IPC + REST + WebSocket schemas (zod)
├─ engine/                       Python compute sidecar
│  ├─ neuromr_engine/api/
│  ├─ neuromr_engine/algorithms/ perfusion/, permeability/, diffusion/, tracking/, fmri/, mrs/,
│  │                             longitudinal/, registration/, subtraction/
│  ├─ neuromr_engine/dicom/
│  └─ tests/                     phantom-based validation
├─ design/                       brief, DESIGN.md, screens (HTML+PNG), COMPONENTS.md
├─ docs/reference/               MR_Apps_IFU.pdf (git-ignored, local only)
├─ docs/spec/                    FUNCTIONAL_SPEC.md, ALGORITHMS.md (equations + citations)
├─ docs/dhf/                     regulatory design-history file (§13)
├─ docs/admin-guide/             IT deployment, silent install, ADMX, AV exclusions
├─ installer/                    WiX MSI project, bootstrapper, ADMX/ADML templates
├─ services/license-server/      floating license Windows Service
├─ scripts/                      test-data download, phantom generation, release
└─ CLAUDE.md                     project memory: stack, rules, commands, current phase
```

Create `CLAUDE.md` in Phase 0 containing §2, §7, a summary of §12 and §13, the commands to build/test/run, and the current phase status; update it at every phase gate.

### 9. Data for development and testing

- `scripts/make_phantoms.py` generates synthetic DICOM series with known ground truth: DSC (gamma-variate bolus with set CBV/CBF/MTT/T0, leakage terms K1/K2, Rician noise at SNR 20/50/100, TR 1.0–2.1 s), DCE (Extended Tofts with set Ktrans/ve/vp, VFA reference series at 5°/15°), DWI/DTI (known tensors, 6–64 directions, b = 0/500/1000/2000), IVIM/kurtosis (known D, f, D*, K), fMRI (block design with known activation blobs), SVS/CSI spectra (known metabolite amplitudes, line widths, noise), longitudinal FLAIR pairs (lesions that grow/shrink by known volumes), SWI/EPI for FLAIR* (known central veins and registration shift), multi-echo GRE (known S0 and T2*).
- `scripts/fetch_public_data.py` downloads fully anonymized public neuro datasets (e.g. DIPY sample data, OpenNeuro BOLD/DWI) into git-ignored `data/`. If a download host is blocked by the session's network policy, fall back to the synthetic phantoms and report the blocked host in the phase report; no test may depend on public data being present.

### 10. Build phases (each ends with the §2.5 gate)

- **Phase 0 — Foundation.** Read manual chapters, write `FUNCTIONAL_SPEC.md` and `ALGORITHMS.md`, scaffold monorepo, CLAUDE.md, CI (lint, typecheck, unit tests, Python tests, license check, SBOM, vulnerability scan), phantom generator, `docs/dhf/` skeleton with requirement IDs, SOUP list, initial risk analysis (§13).
- **Phase 1 — Design (§3: Open Design, or the §3.9 in-repo path).** Brief, DESIGN.md, all §5.2 screens, tokens export, component inventory, design lock.
- **Phase 2a — Platform core.** Electron shell, sidecar supervisor, DICOM import and SQLite index, Study Directory, series-type classifier and package-validity rules, generic Viewer, Analysis Workspace shell with all §6.0 shared behaviors, layouts/presets, bookmarks, Generate Series and table export, UI string catalog.
- **Phase 2b — Security and licensing.** Sign-in and roles, auto-lock, audit trail, encrypted cache, licensing core with offline activation, PDF reports.
- **Phase 2c — Integration and packaging.** Per-monitor DPI, multi-window/multi-monitor with display profiles and hanging protocols, hardware-tier detection, DICOMweb and C-STORE SCP, `neuromr://` launch protocol, MSI built in CI on a Windows runner (unsigned until a code-signing certificate is configured; signing is a tracked open item, not a placeholder).
- **Phase 3 — DSC Neuro Perfusion** including Define AIF, all four methods, Tmax, leakage advanced maps, and phantom validation.
- **Phase 4 — Diffusion** maps, then **Diffusion–Perfusion Mismatch** with co-registration review, manual and automatic modes.
- **Phase 5 — DCE/T1 Perfusion and Permeability** (VFA T1, population and manual AIF, Extended Tofts).
- **Phase 6 — Tractography** (3D view, tracking, bundle manager, statistics, exports).
- **Phase 7 — Brain Function (fMRI)** with paradigm editor and SPM display; SPM overlay into Tractography.
- **Phase 8 — Spectroscopy.**
- **Phase 9 — Longitudinal Brain Analysis** including change-map subtraction fusion and FLAIR*.
- **Phase 10 — Advanced Diffusion, Subtraction, Echo Accumulation.**
- **Phase 11 — Hardening and release.** Performance budgets (§11) on all hardware tiers, the §12.10 test matrix (hardware items are manual checks on real machines, recorded in the verification report), accessibility audit, error-state review against the locked design state screens, signed MSI + ADMX + silent-install docs, antivirus checks, DICOM conformance statement, complete `docs/dhf/` with traceability and verification report, user guide in original wording under `docs/user-guide/`, IT administrator guide under `docs/admin-guide/`.
- **Phase 12 — Client/server.** Remote compute engine as a Windows Service with mTLS, floating license server, background pre-processing rules on the server (§12.5 topology b).

### 11. Verification and acceptance

- **Numerical:** pytest suite per algorithm against phantoms. Gates: DCE semi-quant bias < 5 % at 5 % noise; DSC relCBV/relCBF bias ≤ 10 % at SNR 50 / 2.1 s (oSVD relCBF per the documented tolerance curve) with MTT, TTP, T0 within half the temporal resolution; Tofts Ktrans and ve within 10 % at SNR 50; ADC/FA within 2 % on noise-free tensors and 5 % at SNR 30; IVIM/DKI parameters within published-fit tolerances documented in `ALGORITHMS.md`; fMRI detects all ground-truth blobs at p < 0.001 uncorrected with no false clusters above 10 voxels at SNR 100; MRS metabolite ratios within 5 %; longitudinal volume change within 5 % for lesions ≥ 10 voxels.
- **UI fidelity:** Playwright end-to-end tests open each package on phantom data, perform the main workflow, and screenshot; pixel-diff against the `design/screens/` export with tolerance for live image content; report any deviation.
- **Performance budgets** (2560×1440, mid-range GPU, 16 GB RAM): study open < 2 s for 1,000 images; scroll ≥ 60 fps; DSC live maps for one slice < 300 ms after ROI or mask change; full-volume DSC map generation < 15 s for 20 slices × 60 dynamics; DTI tensor fit < 20 s for 60 slices × 64 directions; fiber tracking from an ROI < 3 s. Laptop tier (iGPU, 16 GB, 1920×1080 @150 %): study open < 4 s, scroll ≥ 45 fps, DSC full volume < 40 s, DTI fit < 60 s, UI input latency < 100 ms during any computation. Diagnostic station with three displays (including 8K): scroll ≥ 60 fps on every display at once.
- **Where tests run:** Linux sessions and CI run unit, Python, and Playwright tests (Electron under `xvfb-run`). Anything Windows-specific (WiX MSI, Authenticode, DPAPI, ADMX, Windows Services, per-monitor DPI v2) is built and tested in a GitHub Actions `windows-latest` job; Linux sessions write that code and rely on that job to verify it. Performance budgets are measured on real hardware, not in the cloud container.
- **Robustness:** invalid inputs show the launcher's reason; corrupt DICOM is quarantined with a message; sidecar crash restarts automatically and restores the session.

### 12. Enterprise product requirements (commercial Windows product for hospitals)

NeuroMR-PRO is sold to hospitals and private imaging centers and installed as a workstation application for radiologists, neuroradiologists, neurologists, neurosurgeons, physicists, and technologists. It runs on anything from a doctor's laptop to a multi-monitor diagnostic reading station. Everything in this section is a product requirement, built into the phases in §10.

#### 12.1 Target platforms
- Windows 11 (23H2 and later) and Windows 10 22H2, x64. Also Windows 10/11 Enterprise LTSC 2021/2024 and IoT Enterprise LTSC, which are common on hospital machines. Windows on ARM is not supported in v1.
- Running the app needs no administrator rights; only the per-machine install does.
- Every feature works fully offline. Many hospital networks are air-gapped or filtered: no feature, activation step, help page, or font may need the internet.

#### 12.2 Hardware tiers
The app detects CPU cores, RAM, GPU (vendor, model, VRAM, WebGL2 support), displays, and power source at startup. It shows them in Settings → System and picks defaults per tier.

| Tier | Typical hardware | Defaults |
|---|---|---|
| Minimum (installer warns below this) | 4 cores, 16 GB RAM, WebGL2-capable integrated GPU, SSD with 20 GB free, 1366×768 | Viewer and 2D packages only; Tractography 3D disabled with a one-line reason |
| Laptop | 4–8 cores, 16–32 GB, Intel Iris Xe/Arc or AMD Radeon 680M+ iGPU, 1920×1080 or 2560×1600 at 125–150 % scaling | 1×2 layout, task panel auto-collapses below 1600 px width, reduced 3D quality, engine thread cap so the UI stays responsive; on battery, a one-line notice that long computations run slower |
| Clinical desktop | 8+ cores, 32 GB, discrete GPU with 8 GB (RTX 4060 / RTX A2000 class), 2560×1440 or 4K | 2×2 layout, full 3D quality |
| Diagnostic reading station | 12+ cores, 64 GB, workstation GPU (RTX 2000 Ada / A4000 class or higher), 2–4 displays: medical 2MP/3MP/5MP (including 5MP portrait 2048×2560) plus 4K/5K/6K/8K color | Multi-window hanging protocols (§12.3), inspector visible by default |

#### 12.3 Displays, DPI, and multi-monitor
- **DPI:** per-monitor DPI awareness v2. All chrome sizes come from tokens and scale with devicePixelRatio. Test scaling 100/125/150/175/200/250/300 %, including monitors with different scaling side by side.
- **Image sharpness:** viewport canvases render at native device pixels (CSS size × DPR), so 4K, 5K, and 8K screens show full image detail. Overlays and text stay crisp. 2D diagnostic rendering is never downscaled. For 3D only, render resolution may drop while you interact, and only when frame time goes above 16 ms; it returns to full resolution when you stop.
- **Resolution range:** 1366×768 up to 7680×4320, landscape and portrait. Below 1600 px wide, the task panel and inspector become overlays instead of columns. At 3840 px and wider, the inspector is shown by default.
- **Multiple monitors:** one app window per display. Never stretch one window across displays, because that breaks DPI, fullscreen, and GPU contexts. Window roles:
  - Main: the workspace.
  - Viewer extension: an extra viewport grid that belongs to the same analysis session.
  - Reference: series browser, results tables, report preview.

  You can drag series, viewports, and graphs between windows. Scroll, zoom, pan, windowing, and crosshair stay linked across windows through the shared session store.
- **Display profiles:** window placement is saved per display configuration (fingerprint = monitor IDs + resolutions + arrangement).
  - Undocking a laptop or unplugging a monitor moves its windows to the remaining displays without losing any state.
  - Reconnecting restores the saved arrangement.
  - First run on a new configuration offers the matching hanging protocol.
- **Hanging protocols** choose layouts by number of monitors, orientation, and resolution (for example 2×2 on landscape 4K, 1×2 stacked on portrait 5MP, maps on the diagnostic display and graphs/tables on the color display).
- **Diagnostic displays:** Settings lists the connected displays by name (from EDID), and the user marks which are diagnostic. Built in:
  - an original-design display test-pattern screen (grayscale steps, low-contrast patches, resolution bars), with a luminance-check procedure in the user guide;
  - a one-line notice when an analysis package opens on a display that isn't marked diagnostic, dismissible for the session.

  Settings → System states that grayscale output is 8-bit through the rendering engine. 10-bit output is out of scope for v1.
- **Fullscreen:** borderless fullscreen per window (F11). Dark-room mode dims the chrome further.
- **Laptop input:** precision touchpad gestures (two-finger scroll = slice scroll, pinch = zoom) and pen input. No function is reachable only by hovering.

#### 12.4 Users, security, and privacy
- **Sign-in options, configurable per site:**
  - the current Windows / Active Directory account (single sign-on);
  - Microsoft Entra ID or any OIDC/SAML provider, through the system browser;
  - local accounts for standalone clinics.
- **Roles:** Radiologist, Neurologist, Neurosurgeon, Technologist, Physicist/QA, Site administrator, Service. Roles control:
  - which packages are visible;
  - who can store results to PACS;
  - who can edit shared presets, injection presets, and thresholds;
  - who can change site settings.

  Each role has its own default start view. For example, neurosurgeons start in Tractography + fMRI, neurologists in Mismatch + Longitudinal, radiologists in the Directory.
- **Auto-lock:** after inactivity (site-configurable, default 15 min), the session locks. Unlocking restores it exactly as it was.
- **Audit trail:** records who opened which study, which results were created, exported, or stored, and every settings change. Entries are hash-chained so tampering is detectable, viewable by administrators, and exportable as IHE ATNA syslog to the hospital's security monitoring.
- **Data at rest:** the local DICOM cache and session files are encrypted with AES-256-GCM, using a key protected by Windows DPAPI. Cache retention policy defaults to 14 days, with purge on schedule and on demand.
- **Data in transit:** DICOM TLS and HTTPS with full certificate validation. Never disable verification.
- **De-identified export:** DICOM PS3.15 Basic Profile, for teaching files and research sharing.
- **Cybersecurity:**
  - STRIDE threat model in `docs/dhf/`;
  - CycloneDX SBOM generated on every build;
  - dependency vulnerability scan in CI that fails on critical findings;
  - Electron hardening: contextIsolation, sandbox, no nodeIntegration, strict CSP, no remote content, every IPC message validated with zod;
  - the sidecar binds 127.0.0.1 only and checks the per-session token.

#### 12.5 Deployment and IT administration
- **Installers:** a per-machine MSI (WiX) for enterprise deployment through Intune, Configuration Manager (SCCM), or Group Policy.
  - Silent install, repair, and uninstall, with documented MSI properties (license server, PACS nodes, data folder, engine location).
  - A signed EXE bootstrapper for manual single-site installs.
- **Code signing:** every EXE, DLL, MSI, and sidecar binary is Authenticode-signed (EV certificate or Azure Trusted Signing) and timestamped.
  - Freeze the sidecar as a PyInstaller *onedir* build, not onefile, to reduce antivirus false positives.
  - Submit each release to Microsoft Defender for analysis.
  - Document the antivirus exclusion paths for the cache.
- **Settings layering:** machine policy (`HKLM\Software\Policies\NeuroMR-PRO`, with ADMX/ADML templates shipped) overrides site config (`%ProgramData%`), which overrides user preferences (`%AppData%`). Settings locked by policy show a lock icon and a tooltip saying who manages them.
- **Updates:**
  - No silent self-update by default. Updates are signed MSI packages that hospital IT approves and deploys.
  - An optional managed channel can point to an internal update server.
  - Updates keep sessions, presets, bookmarks, and licenses. Rollback to the previous version is documented and tested.
- **Shared machines:** each Windows user gets their own profile; shared hanging protocols and presets live at site level.
- **Support:**
  - "Collect diagnostics" exports a zip of logs (patient identifiers redacted), system/GPU/display info, and config.
  - Crash dumps are kept locally.
  - Telemetry is off by default and opt-in only.
- **Deployment topologies:**
  - **(a) Standalone workstation:** engine runs locally.
  - **(b) Client + compute server:** the engine runs as a Windows Service on a hospital GPU server, and laptops and thin desktops connect over TLS with mutual-TLS client certificates. The API contract is identical, and switching is a setting.

  Build (a) first and design the contracts so that (b) is only a configuration change. VDI/Citrix is not supported in v1.

#### 12.6 Hospital integration
- **DICOM networking:** C-ECHO, C-FIND, C-MOVE, C-GET, C-STORE as SCU, plus a C-STORE SCP so modalities and PACS can push studies. DICOMweb QIDO-RS, WADO-RS, STOW-RS. DICOM TLS throughout. Write `docs/DICOM_Conformance_Statement.md` and keep it current.
- **Results back to PACS:**
  - Secondary Capture / SC-RGB;
  - Parametric Map IOD for quantitative maps where the PACS accepts it;
  - Segmentation (SEG) for lesions and mismatch regions;
  - Structured Report TID 1500 for measurements, ratios, and lesion volumes;
  - Encapsulated PDF for reports.
- **Launch from PACS/EMR:** command line and a `neuromr://` URL protocol (open by StudyInstanceUID or accession, optionally straight into a package). A single running instance receives the request and switches to that study, asking for confirmation if another patient's session is open.
- **Background pre-processing:** incoming series are auto-classified, and rules per series type run in the background (tensor fit for DTI, DSC maps, ADC maps, inter-study registration for follow-ups), so results are ready when the doctor opens the case. Progress is visible in the Directory.
- **Reports:** one-click structured PDF report per package, containing:
  - institution name and logo from site config;
  - patient and study data;
  - key images with LUT bars;
  - result tables and graphs;
  - a short method summary;
  - software version and analysis timestamp.

  Reports can be printed to any Windows printer.

#### 12.7 Licensing and commercial packaging
- **Modules sold separately:**

  | Module | Contents |
  |---|---|
  | Core | Directory, Viewer, Subtraction, Echo Accumulation, reports |
  | Perfusion | DSC, DCE/T1, Permeability |
  | Diffusion | Diffusion, Advanced Diffusion |
  | Stroke | Diffusion–Perfusion Mismatch; requires Perfusion + Diffusion |
  | Neurosurgery | Tractography, fMRI |
  | Spectroscopy | Spectroscopy |
  | Follow-up | Longitudinal Brain Analysis, including change-map fusion and FLAIR* |

  Unlicensed modules don't appear in clinical workspaces. The License page lists all modules with their status.
- **License types:**
  - node-locked, with a hardware fingerprint that tolerates one changed component;
  - concurrent/floating, served by a license server running as a Windows Service on the hospital network;
  - time-limited trial;
  - subscription with an expiry date.

  Activation works fully offline: the app makes a request file, and you return a signed license file (Ed25519). Online activation is optional.
- **Expiry:** warnings start 30 days before. After expiry, viewing, reporting, and exporting existing results keep working; only new analyses are blocked. Never lock a user out of results they already created.

#### 12.8 Localization
- The product is English only. No other languages ship.
- From Phase 2, every UI string lives in one message catalog (ICU message format); components never hard-code strings, so translation stays possible later.

#### 12.9 Patient-safety rules in the UI
- The patient banner (name, ID, sex, age, study date) is visible in every window, including extension windows on other monitors.
- Every exported image, report, and Secondary Capture carries patient and study identifiers.
- Loading series from different patients into one analysis session is blocked with a one-line message. Longitudinal comparison checks Patient ID and asks for confirmation when demographics differ.
- Orientation markers (R/L/A/P/S/I) are on every 2D viewport.
- Every map shows its scaling and units.
- Results computed with non-default settings (smoothing, thresholds, AIF source) are flagged in the table and the report.

#### 12.10 Test matrix for sale
- **Hardware matrix, run manually at every release and documented:**
  - Intel iGPU laptop at 150 %;
  - AMD iGPU laptop;
  - NVIDIA desktop 4K at 150 %;
  - dual mixed-DPI (4K + medical 2MP);
  - portrait 5MP + 4K color;
  - 5K or 6K single display;
  - undock/redock;
  - display unplugged mid-session.
- **Playwright screenshot sizes:** 1920×1080 @100 %, 2560×1440 @100 %, 3840×2160 @150 %, 5120×2880 @200 %.
- **Endurance:** 5,000-study index, a 3,000-image DTI series, and 4 hours of continuous scripted use with memory growth under 10 %.

### 13. Medical-device software lifecycle (required to sell)

NeuroMR-PRO's quantitative maps and volumes inform diagnosis and treatment, so selling it to hospitals is regulated. In Iraq, the manufacturer and the product must be registered with the Ministry of Health (KIMADIA / IDRA), which asks for quality certificates and registration in the country of origin. In the EU it falls under MDR Rule 11 (Class IIa or higher). In the US it needs FDA 510(k) clearance (Class II). Hospital procurement asks for the same evidence. Produce and maintain it during the build under `docs/dhf/`, not afterwards:

- Software development plan; requirements specification with stable IDs (derived from FUNCTIONAL_SPEC.md); architecture document; detailed design for the algorithm modules.
- IEC 62304 software safety class B. Maintain a SOUP list: every third-party library with version, license, purpose, and known anomalies.
- ISO 14971 risk management file. Hazards include wrong patient, wrong side (L/R), wrong map scaling or units, failed registration presented as valid, a stale result shown after inputs changed, and a wrong AIF. Map each risk control to code and to a test.
- IEC 62366-1 usability engineering file: use specification per user role, critical tasks, formative test protocols, and a summative test protocol.
- IEC 81001-5-1 cybersecurity file: threat model, SBOM, vulnerability handling process.
- Traceability matrix (requirement → design → test → result) generated automatically from requirement IDs in test names. CI fails if any requirement has no passing test.
- Verification report per release (all phantom results from §11 included), anomaly list, release notes, DICOM conformance statement, and the user guide/IFU in original wording.
- Open-source compliance: nothing GPL or AGPL ships in the product. Check every dependency's license (Cornerstone3D, VTK.js, DIPY, nilearn, ANTsPy, SimpleITK, pynetdicom, highdicom, Electron and Chromium components) and generate a third-party notices file.
- About dialog: product name, version, build, and SBOM link. Manufacturer details and any regulatory marks come from a signed labeling file, and marks appear only after the matching certificate exists (§2 rule 3 still applies until then).

### 14. Start now

1. Confirm the manual PDF is available (§2 rule 1); if not, ask for it and stop.
2. Read the manual chapters listed in §6.
3. Produce `docs/spec/FUNCTIONAL_SPEC.md`, `docs/spec/ALGORITHMS.md`, and `CLAUDE.md`.
4. Scaffold the repository (§8) and CI.
5. Commit, push, and post the Phase 0 report.
6. Proceed to Phase 1: check the Open Design connection (§3.1); if unreachable, use the in-repo design path (§3.9).
