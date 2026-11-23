# NeuroMR-PRO — Functional Specification

Status: Phase 0 baseline (v0.1). Source of truth for all later phases.

This document restates, in original wording, the functional behaviour NeuroMR-PRO must provide. It was condensed from a local reference manual of an existing MR applications suite (kept out of the repository) and from the build brief (`docs/PROMPT.md`). No vendor product names, screenshots, or verbatim text are reproduced. Algorithms and equations live in `ALGORITHMS.md`.

## Conventions

- Every requirement has a stable ID: `<AREA>-<NNN>`. IDs are never reused or renumbered. Tests reference IDs in their names (for example `test_DSC_012_mtt_from_arrival`), and the traceability matrix is generated from them (§13 of the brief).
- **Shall** = mandatory for the phase that owns the package. **Should** = recommended default that may be configured.
- "Default" values marked *(NMR default)* are NeuroMR-PRO choices where the reference gives no number. They are configurable in Settings and documented in `ALGORITHMS.md`.
- Area codes: GEN shared behaviour · DIR directory/launcher · DCE T1/DCE semi-quantitative · DSC T2* perfusion · MM diffusion–perfusion mismatch · REG co-registration review · PERM permeability · DIF diffusion · TRK tractography · FMRI brain function · MRS spectroscopy · LBA longitudinal · ADV advanced diffusion · SUB subtraction · ECHO echo accumulation · SAFE patient safety.

### Package names (original identity)

| Function | NeuroMR-PRO name | Code folder |
|---|---|---|
| T1-weighted dynamic, semi-quantitative | DCE / T1 Perfusion | `dce` |
| T2* dynamic susceptibility contrast | DSC Neuro Perfusion | `dsc` |
| DWI–PWI comparison inside DSC | Diffusion–Perfusion Mismatch | `dsc/mismatch` |
| Extended Tofts | Permeability | `permeability` |
| DWI/DTI maps | Diffusion | `diffusion` |
| Streamline tracking (step inside Diffusion) | Tractography | `tractography` |
| BOLD GLM | Brain Function (fMRI) | `fmri` |
| Proton MRS, SVS and CSI | Spectroscopy | `spectroscopy` |
| Serial brain follow-up | Longitudinal Brain Analysis | `longitudinal` |
| Intensity-difference overlay between time points | Change-map subtraction fusion | `longitudinal/changemap` |
| IVIM / kurtosis / computed DWI | Advanced Diffusion | `adv-diffusion` |
| Pixel arithmetic between volumes | Subtraction | `subtraction` |
| Sum over echoes | Echo Accumulation | `echo` |

Out of scope: cardiac, cartilage, liver, breast, prostate and muscle workflows. Where a shared feature in the reference covers several anatomies (for example spectroscopy anatomy presets), only **Brain** ships in v1; the other presets are not shown.

---

## 1. Shared behaviour (all analysis packages)

### 1.1 Workspace skeleton

- **GEN-001** Each analysis package opens in the common workspace: task-guidance panel on the left, toolbar on top, viewport grid in the centre, optional inspector on the right.
- **GEN-002** The left panel has one switcher with four tabs: Series, Package (task guidance), Key Images, Bookmarks.
- **GEN-003** Task-guidance steps are numbered, show completion state, and can be reopened in any order once their prerequisites are met. Optional steps are hidden until enabled from the More menu.
- **GEN-004** Most functions are reachable from three equivalent controls: task guidance, toolbar, and right-click menu. No function exists only in a context menu.
- **GEN-005** Default viewport roles for map-producing packages: (1) source series at the mid-volume slice, (2) live parametric maps, (3) table ↔ anatomical (or subtracted series for DCE), (4) graph ↔ anatomical. Viewports 3 and 4 switch content via tabs.
- **GEN-006** Context menus open at the pointer (or, from the keyboard with Shift+F10 or the Menu key, at the focused element) and stay inside the viewport that was clicked: a menu that would cross the viewport's right or bottom edge opens to the left of or above the pointer, and a submenu without room on the right opens to the left of its menu, with its chevron pointing that way. A menu or submenu never covers the inspector or the task panel; when the viewport is too small for it, it is clamped to the viewport grid. Esc or a click elsewhere closes it.

### 1.2 Mouse modes and resets

- **GEN-010** Left-drag mode is selectable from toolbar and context menu: Scroll, Pan, Zoom, Window/Level, Mask threshold, Draw freehand ROI, Overlay opacity (map viewports only). Packages show only the modes that apply.
- **GEN-011** Right-drag adjusts the mask threshold on source images and the overlay opacity on map viewports.
- **GEN-012** Reset commands: Reset zoom/pan; Reset windowing; Reset all (zoom, pan, windowing, and removal of all graphics including ROIs, after confirmation).

### 1.3 Scrolling

- **GEN-020** Series with one image attribute (slices only): horizontal drag or ←/→ keys change slice.
- **GEN-021** Series with two attributes (slice × dynamic/phase/echo/b-value): vertical drag or ↑/↓ changes slice; horizontal drag or ←/→ changes the second attribute.
- **GEN-022** In map viewports, horizontal drag cycles through the selected maps; the map name, unit and window range are always shown.
- **GEN-023** Mouse wheel and two-finger touchpad scroll change slice; pinch zooms.

### 1.4 ROIs

- **GEN-030** ROI shapes: spline contour (click points, double-click to close), ellipse (two clicks set width, third click sets height and confirms), freehand (drag; release closes and confirms).
- **GEN-031** Numerical and graphical results update immediately when an ROI is confirmed or edited.
- **GEN-032** After confirmation an ROI can be reshaped by dragging anchors, moved by dragging between anchors, renamed by double-clicking its label, and deleted from its context menu or from the table.
- **GEN-033** Default names are ROI1, ROI2, …. Duplicate user names receive a numeric suffix ("Hemisphere", "Hemisphere 2").
- **GEN-034** Delete last ROI: `Ctrl+Z`, context menu on the ROI, or "Delete last drawn ROI" on the image. Full undo/redo (`Ctrl+Z`/`Ctrl+Y`) covers ROI create, edit and delete.
- **GEN-035** ROI colours follow the fixed 8-colour colour-vision-safe palette in order; the same colour is used for the outline, table row marker and graph curve.

### 1.5 Contralateral mirroring and reference ROI

- **GEN-040** "Show mirror line" displays a draggable vertical line at the image centre. A notice tells the user to align it with the brain midline.
- **GEN-041** "Create contralateral ROI automatically" mirrors each new ROI across the line into a linked ROI. Moving the line moves linked mirror ROIs.
- **GEN-042** For mirrored pairs the table shows lesion/contralateral ratios per parameter.
- **GEN-043** Any one ROI can be declared the reference ROI; its label gains the suffix "-ref". The ratio table then shows every other ROI relative to it and recomputes whenever the reference changes. Only one reference ROI exists at a time.
- **GEN-044** Linked mirror ROIs are excluded from reference-ROI ratios (they show only the ratio to their source ROI). Unlinking a mirror ROI makes both ROIs participate in reference ratios.
- **GEN-045** The reference-ROI selection is stored in bookmarks.

### 1.6 Mask

- **GEN-050** A mask threshold slider (and right-drag on the source) excludes voxels below the threshold from all computations. Excluded voxels are drawn with the mask tint while the mask step is active or "Show mask" is on.
- **GEN-051** Changing the mask recomputes live maps and ROI results. In leakage-corrected DSC the mask also changes the reference-voxel set; a contextual note says so.

### 1.7 Smoothing

- **GEN-060** Spatial smoothing: None / Weak / Medium / Strong = in-plane kernel width 1, 3, 5, 7 voxels (uniform average).
- **GEN-061** Temporal smoothing: None / Weak / Medium / Strong = uniform filter across 1, 3, 5, 7 dynamics.
- **GEN-062** Smoothing applies to both source data and maps and therefore changes numerical results. The control tooltip says so, and results computed with non-default smoothing are flagged in the table and report (SAFE-060).

### 1.8 Underlay and overlay

- **GEN-070** Underlay options: None; Source series; Other series (picker or drag-and-drop from the Series tab).
- **GEN-071** The underlay is resampled to the overlay geometry; resolution follows the overlay.
- **GEN-072** Secondary Capture series cannot be used as underlay (no geometry); the picker shows them disabled with the reason.
- **GEN-073** An overlay opacity slider (0–100 %) and right-drag on the map adjust map opacity.
- **GEN-074** If the chosen underlay's frame of reference or geometry differs from the overlay, a one-line warning says the anatomy may be mispositioned and that motion between acquisitions can cause misalignment.

### 1.9 Anatomical viewer

- **GEN-080** Any series can be loaded into the anatomical viewer from its context menu ("Select series") or by drag-and-drop.
- **GEN-081** The anatomical viewer is always shown in the source orientation, using real-time MPR when needed.
- **GEN-082** When the anatomical series resolution is coarser than the source in any axis by more than 1.5×, a one-line notice warns that the reformat will look blurred.

### 1.10 Follow mouse

- **GEN-090** "Follow mouse" shows, for the voxel under the cursor, its curve in the graph viewer and its parameter values in the table, updating in real time without blocking input.

### 1.11 Graph viewer

- **GEN-100** One checkbox per ROI toggles its curve; an ROI-average toggle; auto-scale toggle; x-axis in seconds or dynamic number.
- **GEN-101** Optional fitted-curve overlay where the method fits a model.
- **GEN-102** Vertical marker lines for the current dynamic and the reference dynamic; hidden markers can be restored from the context menu.

### 1.12 Table viewer

- **GEN-110** Measurement type, switchable from the table context menu: **Region parameters** (default — fit the ROI-mean curve) or **Mean voxel parameters** (mean of voxel map values inside the ROI). The table heading states which is active.
- **GEN-111** "Show ROI statistics" opens a floating table with max, min, median, mean and SD of each parameter over the ROI voxels.
- **GEN-112** Every value carries its unit. Tables scroll when they exceed the viewport.
- **GEN-113** `Ctrl+C` or "Copy" copies the focused table or viewport content as tab-separated text.

### 1.13 Windowing ROI

- **GEN-120** "Draw windowing ROI" on a map recomputes that map's colour window to maximise contrast inside the ROI (2nd–98th percentile of the in-ROI values). Each map keeps its own window.

### 1.14 Viewing tools

- **GEN-130** Mirror L↔R, flip U↔D, rotate ±90°. Orientation markers update accordingly and are never hidden (SAFE-040).

### 1.15 Colour look-up tables

- **GEN-140** Map LUTs: Gray (black → white), Blue-to-Red (blue → green → yellow → orange → red), Stroke (black → light blue → green → yellow/orange → red), Hot, and a perceptually uniform viridis-family LUT for statistics.
- **GEN-141** Every colour map shows a vertical colour bar with min/max values and units.

### 1.16 Layouts

- **GEN-150** System layouts 1×1, 1×2, 2×1, 2×2, 2×3, 3×3 plus user presets.
- **GEN-151** Save current layout as a named preset; delete user presets. System presets cannot be deleted; the active preset cannot be deleted.
- **GEN-152** A saved preset remembers which series was shown in each viewer and reloads the matching series type for the next case.

### 1.17 Generate series

- **GEN-160** "Generate series" writes the selected maps as a new DICOM series: Secondary Capture (grayscale values with rescale slope/intercept and units) or SC-RGB (LUT burned in). The user names the series.
- **GEN-161** "Register data while saving" (where offered) runs motion correction before computing the saved maps. A note states that preview and saved maps may then differ. Registered derived series are labelled as registered in the series description.
- **GEN-162** Generated series carry patient and study identifiers, the source series reference, the method, and any non-default settings.

### 1.18 Export

- **GEN-170** "Save all tables" exports every table with ROI dynamic values as CSV or HTML, optionally with all graphs as PNG, to a chosen folder.
- **GEN-171** A table can also be saved as a DICOM Secondary Capture.

### 1.19 Bookmarks and session state

- **GEN-180** A bookmark captures the full analysis state: ROIs, mirror line, reference ROI, AIF, mask, thresholds, smoothing, selected maps, LUTs and windows, layout and series assignment.
- **GEN-181** The session autosaves continuously; reopening the study restores the last state.

### 1.20 Session data flow

- **GEN-190** From the Directory, a newly arrived series can be added to a running analysis session ("Add to running session").
- **GEN-191** A package cannot open a series while its import or background pre-processing is still running; the launcher shows progress and the reason.
- **GEN-192** Packages that combine series from several studies warn when the data come from more than one study and block series from different patients (SAFE-020).

### 1.21 Interface language

- **GEN-200** The interface is English only; no other language ships. Every user-facing string (labels, tooltips, messages, launcher reasons, report text) comes from one message catalog in ICU message format, and components never hard-code strings, so a translation can be added later without code changes.
- **GEN-201** Numbers use English (en-US) formatting everywhere they are displayed, including tables, overlays, colour bars, graph ticks, messages, tooltips and reports: a period as the decimal mark and a comma grouping thousands for every quantity of 1,000 or more (2,009 files; b 1,000 s/mm²; W 1,298.6). Identifiers are not grouped: DICOM tags, ports, AE titles, accession, series and instance numbers, dates and times, version numbers, and display resolutions written as width × height. Numeric inputs show the value as typed and accept it with or without grouping commas. Machine-readable exports (CSV, DICOM values, JSON) are never grouped.

### 1.22 Interface scale and text size

- **GEN-210** Settings → Displays offers an interface scale of 100 %, 125 % or 150 % per user and per display, on top of the Windows display scale. It scales text, controls, icons and spacing of the chrome and the viewport overlays; image pixels are still drawn at the display's native resolution and are never resampled for the chrome scale. The change applies at once, without a restart, and is stored with the user's display profile. The setting shows the resulting workspace width; below 1600 CSS px the task panel and inspector become overlays, as on a laptop.
- **GEN-211** Minimum text size at 100 %: 13 px for all interface text (panels, tables, table units, menus, buttons, hints, rail, status bar); 12 px only for image overlays, colour bars, graph ticks and keycaps.

### 1.23 Compute engine

- **GEN-220** The compute engine is a separate local process that the application starts, supervises and stops. It listens on 127.0.0.1 only, on a port chosen by the operating system, and accepts a request only if it carries the per-session token; anything else is rejected with 401 before any handler runs. The token is passed to the engine through its standard input, never on the command line or in an environment variable, and a new one is made every time the engine starts.
- **GEN-221** The status bar shows the engine state with the status-bar component's states: *starting* (warning dot), *connected · local* (success dot), *restarting, attempt n of 5* (warning dot) and *unavailable* (critical dot), followed by one actionable sentence. The application is ready to use only when the engine has answered a health check with its version.
- **GEN-222** When the engine exits unexpectedly it is restarted automatically after 1, 2, 4, 8 and 16 s. A run that stays healthy for 60 s resets the count. After five failed restarts the state is *unavailable* and the user can retry from the status bar. Jobs that were running when the engine stopped are reported as failed with a one-line reason; they are never reported as done.
- **GEN-223** Long jobs report progress (fraction and stage) over one authenticated WebSocket per session, using the job event contract (`JobEvent`). Every job can be cancelled; a cancelled job stops at its next progress point and reports *cancelled*, and it never writes partial results.
- **GEN-224** On quit the application asks the engine to shut down and ends the process if it has not exited within 3 s, so no engine process outlives the application.


### 1.24 Generic Viewer

- **GEN-230** The Viewer activity shows any series of the selected study without an analysis package, in the common workspace (GEN-001): the Series tab on the left, the toolbar, the viewport grid and the DICOM inspector. Double-click or Enter on series in the Directory opens them in the Viewer, one series per viewport in selection order; clicking a series in the Series tab loads it into the active viewport.
- **GEN-231** Each viewport shows, as overlays: top left the series description, the position on each image axis ("Dyn 1/60 · Slice 4/8", or b-value, echo or volume instead of Dyn) and the timing of the current image (time from the first dynamic, TR, TE); top right the patient name, patient ID and study date (SAFE-001); bottom left the window width and level with the unit; bottom right the zoom, pixel spacing and matrix; and the orientation markers on all four edges (SAFE-040).
- **GEN-232** Displayed and measured values are the stored values with Rescale Slope and Intercept applied. The initial window is the series' Window Center/Width when it is recorded, otherwise the 1st–99th percentile range of the middle image.
- **GEN-233** The inspector lists the main DICOM attributes of the active viewport's current image (identification, acquisition and geometry: tag, keyword, value, with the unit where the attribute has one), with identifiers and dates ungrouped (GEN-201).
- **GEN-234** The renderer requests images by SOP Instance UID only; the main process reads them from the local store (DIR-007), so no file path ever crosses the process boundary. Pixel decoding never runs on the renderer's main thread for compressed data; uncompressed data is passed through as typed arrays.
- **GEN-235** Without WebGL the viewer draws on the CPU with the same overlays and behaviour; the status bar says that rendering is in software mode. Zoom reads relative to fit on both paths, so a session saved on one path restores the same zoom on the other; in software mode the pan is not saved (a pan saved earlier is kept).
- **GEN-237** The first status-bar item names what is open. In the Viewer, when a viewport shows a series, it reads "Study {study description or accession} · #{series number} {series description}" for the active viewport, followed by the number of series shown when there is more than one; otherwise it reads "No study open".
- **GEN-238** The Viewer, thumbnails and every package read pixel data in these transfer syntaxes: Implicit and Explicit VR Little Endian; RLE Lossless (1.2.840.10008.1.2.5); JPEG Baseline (Process 1, 8-bit, …4.50) and Extended (Process 2 & 4, 12-bit, …4.51); JPEG Lossless (Process 14, …4.57, and selection value 1, …4.70); JPEG-LS lossless and near-lossless (…4.80, …4.81); JPEG 2000 lossless and lossy (…4.90, …4.91). The codecs ship with the application and work offline; decoding runs in a worker thread of the main process, never in the renderer. Decoded values equal the stored values for lossless syntaxes. A frame that cannot be decoded shows the one-line notice of GEN-234 naming the transfer syntax.
- **GEN-239** An image stored with lossy compression (Lossy Image Compression (0028,2110) = 01, or a lossy syntax: …4.50, …4.51, …4.81, …4.91) shows "Lossy compressed" in the viewport's top-left overlay, and its series carries the same note in the Directory, because values may differ from the acquisition.
- **GEN-240** Multi-frame instances (Enhanced MR Image Storage 1.2.840.10008.5.1.4.1.1.4.1, and any image with Per-frame Functional Groups (5200,9230)) are split into frames for indexing, classification (DIR-003) and display, so an enhanced series behaves like the same acquisition stored as one image per instance. Each frame takes its values from its per-frame functional group, else the shared group (5200,9229), else the top-level attribute: position (Plane Position 0020,9113), orientation (Plane Orientation 0020,9116), pixel spacing and slice thickness (Pixel Measures 0028,9110), temporal position (Frame Content 0020,9111: Temporal Position Index; time from Temporal Position Time Offset, else Frame Acquisition DateTime relative to the first frame), echo time (MR Echo 0018,9114), TR and flip angle (MR Timing 0018,9112), b-value and gradient direction (MR Diffusion 0018,9117), rescale (Pixel Value Transformation 0028,9145) and window (Frame VOI LUT 0028,9132). Frames are addressed as SOP Instance UID plus frame number; the Directory counts frames as images. Vendor files that follow the standard functional groups (as Philips and Siemens enhanced exports do) need nothing vendor-specific.
- **GEN-236** ROIs (GEN-030…035) can be drawn in the Viewer on any series. An ROI belongs to one slice position of its series and is shown on that slice for every dynamic, echo or volume. The inspector lists each ROI of the active viewport with its colour, name and the statistics of the current image inside it: mean, SD, min, max (all with the series' unit), voxel count and area in mm². A voxel belongs to an ROI when its centre lies inside the outline. Statistics update as soon as the ROI is confirmed or edited and when the image changes. ROIs, their undo/redo history (GEN-034) and their palette order (GEN-035) belong to the series, not to the viewport: a series shown in two viewports shows the same ROIs in both, and its ROIs stay when the series is moved to another viewport or opened again.
- **GEN-241** Viewer sessions (GEN-181 for the generic Viewer). For each study, the application keeps the last Viewer state in the local index: layout, series per viewport, active viewport, and per series the slice, dynamic/echo/volume, mirror/flip/rotation, zoom and pan, window, ROIs and ROI palette order (not the undo history). It is saved within one second of a change and when the application quits, and survives restarts. Opening series from the Directory restores each series' saved state. Double-click or Enter on a study row reopens that study's last session (layout and series assignment included); a study without a session opens its first series.
- **GEN-242** Viewer bookmarks (GEN-180 for the generic Viewer). "Save bookmark" (`Ctrl+Shift+B`, or the Series tab) stores the current session state of the study under a name, default "Bookmark 1", "Bookmark 2", … (duplicates get a numeric suffix as in GEN-033), with the time it was saved. The Series tab lists the study's bookmarks, newest first; clicking one restores its state; its context menu renames or deletes it. Bookmarks are kept in the local index with their study. Packages add their own state to the same bookmarks (GEN-180).
- **GEN-243** Viewer layout presets (GEN-150…152 for the generic Viewer). "Layout presets…" (`Ctrl+Shift+L` opens it with the save name field focused, or the layout picker) opens the dialog of screen 17: the system presets 1×1, 1×2, 2×1, 2×2, 2×3, 3×3 and the user presets, each with a schematic of its grid; the selected preset's grid shows what each viewport will load. "Save current layout as…" stores the current layout under a name (unique, GEN-033 suffix) and, for each viewport, the series type (DIR-003; the first type of the series) and description of the series it shows. Applying a user preset on the open study loads, for each viewport, an unused series of that type, preferring the same description, then the lowest series number; a series without a type matches by description only. A viewport with no matching series stays empty and says which series type and description it expected. Applying a system preset only changes the grid. User presets can be renamed and deleted; system presets and the active preset (the last one applied, while the grid still matches it) cannot be deleted. Presets belong to the user profile, not to a study, and are kept in the local index.
- **GEN-244** Reset all in the Viewer (GEN-012). The viewport menu offers "Reset all…"; after a confirmation that names the series and the number of ROIs to be removed, it resets zoom, pan, mirror/flip/rotation and window and removes every ROI of the viewport's series. The removal is one undo step (GEN-034).
- **GEN-245** ROI curves in the Viewer (GEN-100, GEN-102 for the generic Viewer). For a series with a second axis (dynamic, echo or volume) the "ROI curves" panel (`G`, or the toolbar) under the viewport grid plots, for the active viewport's series, the mean value inside each ROI (GEN-236 voxel rule) at that ROI's slice for every point of the second axis. One checkbox per ROI shows or hides its curve; "Average" adds the mean of the shown curves; "Auto-scale" fits the y-axis to the shown curves, and when it is off the y-axis keeps its last range; the x-axis shows seconds from the first dynamic when acquisition times are known, otherwise the point number, switchable when both exist. A vertical line marks the current point. Curves are computed in the main process from the stored values, never on the renderer's main thread, and update when an ROI is confirmed, edited or removed. For a series without a second axis the panel says that curves need dynamics, echoes or volumes.
- **GEN-246** Copy as text in the Viewer (GEN-113). `Ctrl+C`, or "Copy" in the panel, copies the focused ROI curves panel (one row per point: x value then one column per shown curve, header with names and units) or the inspector's ROI table (one row per ROI: name, mean, SD, min, max, voxels, area, with units in the header) as tab-separated text, numbers in machine format (GEN-201). Nothing is copied when no table is focused, and the text selection keeps its usual Ctrl+C.
---

## 2. Study Directory and launcher

- **DIR-001** Sources: local folder or DICOMDIR import, configured PACS nodes, and the local store (including studies pushed to the built-in C-STORE SCP).
- **DIR-002** Study list → series list with thumbnails, series description, number of images, and series-type badges.
- **DIR-003** Series-type classifier assigns one or more types from DICOM attributes: DSC, DCE, DWI, DTI, fMRI (BOLD), MRS-SVS, MRS-CSI, FLAIR, T1, T2, SWI, multi-echo, VFA reference (T1 gradient echo, non-dynamic, flip angle recorded), derived map, Secondary Capture. The rules, their order and the attributes they read are in `ALGORITHMS.md` §13; a series that matches no rule has no type and opens only in the generic Viewer.
- **DIR-004** The analysis launcher lists every package with valid/invalid status for the current selection. Invalid packages show a one-line reason. Each rule first checks the DIR-003 series type of the primary (first selected) series, then its counts; a series without the required type is invalid with a reason that names the type it needs. Validity rules:

| Package | Rule |
|---|---|
| DCE / T1 Perfusion | DCE series (T1-weighted dynamic) with ≥ 4 dynamics |
| DSC Neuro Perfusion | DSC series (dynamic T2*-weighted) with ≥ 5 dynamics |
| Mismatch (inside DSC) | DSC package open and a DWI or DTI series in the study with ≥ 2 b-values (or ADC maps) |
| Permeability | DCE series with ≥ 20 dynamics, plus ≥ 1 non-dynamic VFA reference series with a different flip angle (2 recommended) |
| Diffusion | DWI or DTI series with ≥ 2 b-values; FA and directional maps need ≥ 6 gradient directions plus b = 0 |
| Tractography | DTI series with ≥ 6 directions and ≥ 2 b-values |
| Brain Function | FMRI (BOLD) series (≥ 20 dynamics required, ≥ 80 recommended) |
| Spectroscopy | an MRS series (SVS or CSI) **and** an imaging series selected together |
| Longitudinal | 1–4 MR studies of the same patient |
| Advanced Diffusion | isotropic DWI or DTI series with ≥ 2 b-values (model list filtered per ADV-010) |
| Subtraction | an imaging series with ≥ 2 dynamics, or two imaging series with matching geometry. DSC and FMRI time series are not valid (they open in their own packages), nor are MRS series or Secondary Captures (no measured pixel values) |
| Echo Accumulation | multi-echo series with ≥ 2 echoes |

- **DIR-005** Background pre-processing progress per series is visible in the Directory (DIR-003 classification, and rules from the brief §12.6).
- **DIR-006** Corrupt or unreadable DICOM is quarantined with a message naming the file and the reason; it never blocks the rest of the import. Reasons: file truncated or unreadable; a required identifier (Study, Series or SOP Instance UID) missing; an image without pixel data; a file listed in a DICOMDIR that is missing. The Directory shows the count from the last import with a link to the quarantine list (file path, reason, time); quarantined files are never copied into the local store. Files that carry no DICOM header at all (for example text files or thumbnails next to the images) are not quarantined; they are skipped and counted.
- **DIR-007** Import copies each instance into the local store and records it in the local study index (SQLite), which survives restarts. An instance whose SOP Instance UID is already in the store is skipped and counted as a duplicate, so importing the same folder twice changes nothing. Each import reports how many instances were imported, skipped as duplicates, skipped as not DICOM, and quarantined. Store paths never come from file contents: an identifier that is not a plain DICOM UID is replaced by its hash in the path.
- **DIR-008** Import reads files off the interface thread: the Directory stays responsive, shows progress (files read of files found) and can cancel the import. Instances already stored when an import is cancelled stay in the store and in the index.
- **DIR-009** The study list shows patient name, patient ID, birth date, sex, study date, study description, series count, image count, modality with field strength, and accession; the series list (DIR-002) adds series number, type badges, image count, dimensions (dynamics, volumes or echoes × slices · matrix) and status. The search box (Ctrl+K) filters studies by patient name, patient ID or accession as the user types.

---

## 3. DCE / T1 Perfusion (semi-quantitative)

- **DCE-001** Input: T1-weighted dynamic series with slices × dynamics, ≥ 4 dynamics.
- **DCE-002** Viewports: source; live maps; subtracted series ↔ table (arrow toggle); graph ↔ anatomical.
- **DCE-003** Task guidance: Spatial smoothing → Mask → Select maps → Anatomical series → Draw ROI → Underlay → Generate series.
- **DCE-004** Subtraction reference is dynamic 1 by default; "Set as subtraction reference" on the source context menu picks another dynamic. The subtracted viewport shows current dynamic minus reference.
- **DCE-005** Maps and table parameters (definitions in `ALGORITHMS.md` §DCE): RELENH [%], MAXENH [a.u.], MAXRELENH [%], T0 [s], S0 [a.u.], TTP [s], WASHIN [a.u./s], WASHOUT [a.u./s], BREVENH [s], AREACURV [a.u.·s].
- **DCE-006** WASHIN, WASHOUT and BREVENH use discrete slopes when the series has ≤ 8 dynamics and a bilinear fit when it has > 8 dynamics. The graph can overlay the fitted wash-in/wash-out lines.
- **DCE-007** Accuracy: at 5 % image noise the mean bias of each parameter is < 5 % with tolerance 10 % (phantom test).

---

## 4. DSC Neuro Perfusion

### 4.1 Inputs and workflow

- **DSC-001** Input: T2*-weighted (GRE- or SE-EPI) dynamic series, ≥ 5 dynamics.
- **DSC-002** Task guidance: Select maps → Select underlay → Analysis → Generate maps → (optional) Diffusion–Perfusion Mismatch.
- **DSC-003** Optional "Skip dynamics" step (enabled from More) excludes the first N dynamics before steady state.
- **DSC-004** Spatial and temporal smoothing per GEN-060/061.
- **DSC-005** A contextual caution states that perfusion acquisition and analysis are not standardised and that follow-up comparisons should use the same software and method.

### 4.2 Analysis methods

- **DSC-010** Method selector: Gamma variate · Model-free · Manual AIF (deconvolution) · Leakage correction. All other steps are shared.
- **DSC-011** Gamma variate: fit a gamma-variate to ΔR2*(t); relCBV = area under the fit; MTT = first moment of the fit measured from bolus arrival T0; relCBF = relCBV / MTT; plus T0 and TTP.
- **DSC-012** Model-free: detect front and tail baselines; MTT = first moment of ΔR2* measured from T0; T0, TTP; relCBV = area; relCBF = relCBV / MTT.
- **DSC-013** Manual AIF: block-circulant (delay-insensitive) SVD deconvolution with oscillation-index regularisation; outputs relCBF [ml/100 g/min], relCBV [ml/100 g], MTT [s], TTP [s], T0 [s]; optional Tmax/Delay map [s] chosen in Generate Series.
- **DSC-014** Leakage correction (Boxerman–Schmainda–Weisskoff): reference curve = mean ΔR2* of non-enhancing brain voxels inside the mask; per voxel, linear least squares fits K1 (bolus scaling, typically 0–2) and K2 [1/min] (leakage; positive when T1 effects dominate, negative when T2* effects dominate). Outputs relCBVuncorr, relCBVcorr, K1, K2.
- **DSC-015** Leakage advanced maps (More → Advanced maps): R² goodness of fit and the reference-voxel mask.
- **DSC-016** A contextual notice for deconvolution states that results depend on model assumptions and can over- or under-estimate true perfusion.
- **DSC-017** Units follow the method. Gamma variate, Model-free and Leakage correction have no arterial input, so relCBV and relCBF (and every value derived from them, such as ratios' inputs, map windows, colour bars, table columns, saved series and reports) are in arbitrary units [a.u.]; MTT, TTP and T0 stay in seconds and ratios are unitless. ml/100 g and ml/100 g/min appear only for Manual AIF (deconvolution, DSC-013). Changing the method changes the units shown everywhere at once, and the region table names the method and its units in its header.

### 4.3 Define AIF workspace

- **DSC-020** Choosing Manual AIF opens the Define AIF workspace (a full workspace, not a small popup) on the middle slice.
- **DSC-021** A 7×7-voxel box is dragged over an artery; the right pane shows the 49 voxel curves, updating as the box moves. Navigation (slice, zoom, pan, windowing) works in the left pane.
- **DSC-022** Clicking a curve toggles its inclusion; included curves are highlighted. An averaged-AIF preview updates live. Apply confirms; Cancel discards; Undo restores the previous box position.
- **DSC-023** The workspace can be reopened from task guidance to refine the AIF.
- **DSC-024** Contextual warnings in the AIF workspace: partial-volume effects; motion; low temporal resolution under-sampling the peak; slow bolus. An automatic quality check flags an AIF whose peak is late, broad, or low relative to tissue curves.

### 4.4 ROIs, results and accuracy

- **DSC-030** ROI, mirror, reference ROI, graph, and table per §1. Lesion/contralateral and lesion/reference ratios are shown for relCBV, relCBF, MTT.
- **DSC-031** Accuracy on the digital phantom at SNR 50 and temporal resolution 2.1 s: mean bias ≤ 10 % for relCBV and relCBF (gamma variate, model-free, leakage); ≤ half the temporal resolution for MTT, TTP, T0. Leakage: mean bias ≤ 0.11 for K1 and ≤ 1 × 10⁻³ /min for K2.
- **DSC-032** Deconvolution accuracy: relCBV ≤ 10 % bias; relCBF within the oSVD tolerance curve over MTT 2–12 s documented in `ALGORITHMS.md`; phantom CBF levels ordered monotonically.

---

## 5. Diffusion–Perfusion Mismatch (stage inside DSC)

- **MM-001** Available when the study has a valid diffusion series. If only DWI/DTI exists, ADC-iso and eADC-iso are generated automatically on entry.
- **MM-002** On entry, perfusion dynamic 1 is registered rigidly to the diffusion b0 volume with local-correlation similarity by default.
- **MM-003** Layout 2×2 by default (upper-left: diffusion maps and series in tabs; upper-right: perfusion maps and series in tabs; lower: table and graph, initially empty). A 2×3 layout is selectable and can be saved as a preset.
- **MM-004** Diffusion and perfusion viewers are linked for position, zoom and pan.
- **MM-005** "Review co-registration" opens the co-registration workspace (REG-001…).
- **MM-006** Manual mode: user draws a diffusion ROI on a diffusion series and a perfusion ROI on a perfusion series; each propagates to all linked series and maps → area results.
- **MM-007** Automatic mode: seed points on the ADC map and on the Tmax/Delay map; threshold region growing (ADC < 620 × 10⁻⁶ mm²/s and Tmax > 6 s *(NMR defaults)*); editable thresholds with "Re-segment"; additional seeds; exclusion ROI erases segmented voxels → volume results.
- **MM-008** Results: penumbra (perfusion deficit minus diffusion core) overlaid in anatomical viewers, optional fill and hatching; Table 1 lists each region with area/volume and mean ADC (clicking a column jumps to its slice); Table 2 lists perfusion volume [ml], diffusion (core) volume [ml], mismatch volume = perfusion − core [ml], mismatch ratio = perfusion / core [unitless, two decimals] and relative mismatch = (perfusion − core) / perfusion [%]; when the core volume is 0 the ratio shows "— (no core)" instead of a number; graph of signal curves for each deficit. Reports carry the same four measures with the same names.
- **MM-009** Segmentation opacity is adjustable per viewport (ADC, Delay, anatomical) from the context menu.
- **MM-010** Anatomical viewers in this stage are co-registered to the perfusion input, receive propagated ROIs, and scroll linked with diffusion and perfusion viewers.
- **MM-011** A persistent one-line notice states that mismatch output is decision support only and not a stand-alone tool for selecting acute stroke treatment.
- **MM-012** Warnings: different frames of reference may misposition anatomy; volume construction may require interpolation.

---

## 6. Co-registration review and edit (shared workspace)

Used by Mismatch, Tractography (anatomical underlay and fMRI overlay), Brain Function, and Longitudinal Brain Analysis (LBA-012 edit registration between two time points).

- **REG-001** Full workspace with fusion views of input and reference in three orthogonal planes; orientation can be changed.
- **REG-002** Initial alignment by rigid Normalized Mutual Information; an algorithm selector offers at least NMI, local correlation, and mutual information (Mattes).
- **REG-003** Translation nudge arrows and a free Translate tool; rotation nudge arrows and a free Rotate tool.
- **REG-004** Undo, Redo, Reset all alignment; Save registration; Cancel/back without saving.
- **REG-005** Saving an edited registration recomputes dependent results (Mismatch) or deletes dependent computed results after confirmation (Tractography, Brain Function). The confirmation states which results will be removed.
- **REG-006** A contextual warning reminds the user to verify alignment before analysis; registration that has not been reviewed is marked "not reviewed" in reports.

---

## 7. Permeability (Extended Tofts)

- **PERM-001** Inputs: DCE series ≥ 20 dynamics; two non-dynamic T1-weighted gradient-echo reference series with different flip angles (default pair 5° and 15°; identical TR ≈ 10 ms and TE ≈ 2 ms; same geometry as the DCE series).
- **PERM-002** Reference series are detected automatically (minimum and maximum flip angle available); "Select reference series" in More overrides them.
- **PERM-003** A single reference series is accepted only when its TR and TE equal those of the DCE series and its flip angle differs; the DCE pre-contrast baseline then serves as the second flip angle.
- **PERM-004** AIF: population model (bi-exponential plasma curve, shape chosen by injection duration short < 5 s, medium 5–10 s, long > 10 s) or Manual AIF (7×7 workspace as DSC-020…023, typically ~5 voxels selected).
- **PERM-005** Input panel: injection preset (field strength, contrast relaxivity [s⁻¹·mmol⁻¹·L], dose [mmol/kg], injection duration class, hematocrit [%], default 45 %). A warning asks the user to verify the preset matches the actual injection.
- **PERM-006** Injection-preset library in Settings: create, view/edit, delete. A shipped example preset (gadolinium agent, 0.1 mmol/kg, medium duration, Hct 45 %) is labelled as an example that each site must replace.
- **PERM-007** Blood T1 depends on field strength (1.0 T 1345 ms; 1.5 T 1412 ms; 3.0 T 1613 ms; 7.0 T 2149 ms).
- **PERM-008** Outputs: Ktrans [min⁻¹], kep [min⁻¹], ve = Ktrans/kep, vp, iAUC; optional T1 [ms] and Delay [s] maps for quality control.
- **PERM-009** Notices: AIF definition, motion, temporal resolution and injection conditions affect values; fits are unreliable for very small ve with large Ktrans; unreliable AIF shapes must be avoided.
- **PERM-010** ROI tools, mirror line (brain series), graph, table, underlay, anatomical viewer, generate series per §1.
- **PERM-011** Accuracy: Ktrans and ve within 10 % mean bias at SNR 50 on the Tofts phantom (target r² ≥ 0.94 against ground truth).
- **PERM-012** Task guidance: Reference series → Injection and AIF → Select maps → Draw ROI → Generate series.

---

## 8. Diffusion

- **DIF-001** Input: diffusion-weighted series with ≥ 2 b-values. Anisotropy maps need ≥ 6 non-collinear directions plus b = 0.
- **DIF-002** Default layout: source and maps (two viewports); map layout 1×1 or 2×2.
- **DIF-003** Scrolling: vertical drag / ↑↓ = slices; horizontal drag / ←→ = b-values (source) or maps (map viewport).
- **DIF-004** "Select b-values" requires at least 2 selected.
- **DIF-005** Maps: per-direction ADC; ADC-iso [mm²/s]; per-direction eADC and eADC-iso; DWI-iso; FA; FA direction (red = R–L, green = A–P, blue = S–I); advanced: axial diffusivity, radial diffusivity, relative anisotropy [mm²/s or unitless].
- **DIF-006** ADC, eADC and DWI-iso have no live preview; they are computed on Generate. Other maps preview live.
- **DIF-007** Maps that cannot be computed from the data are disabled with a reason in the viewport status line.
- **DIF-008** DWI-iso is offered only when exactly 2 b-values are selected and the gradient directions are known (not for acquisitions where only a combined trace image is stored).
- **DIF-009** Mask, register while saving (registration across directions; derived series prefixed "Reg"), generate series.
- **DIF-010** Accuracy: ADC and FA within 2 % on noise-free tensors and 5 % at SNR 30.
- **DIF-011** A notice states that for acute stroke, diffusion maps are used together with perfusion in the Mismatch stage.
- **DIF-012** Task guidance: Select b-values → Select maps → Mask → Generate series (optional: Tractography step, TRK).

---

## 9. Tractography (step inside Diffusion)

- **TRK-001** Input: DTI with ≥ 6 directions and ≥ 2 b-values. Hidden with a one-line reason on the Minimum hardware tier (no 3D).
- **TRK-002** Layout: large 3D main view with three orthogonal planes plus three reference views (axial, coronal, sagittal) on the right; alternative 1×1. Reference views show coloured plane lines that can be dragged.
- **TRK-003** Main view interactions: plane position, pan, zoom, roll/rotate, gray level, threshold, plane opacity. Orientation presets: axial-from-feet, anterior, left-sagittal. Per-plane show/hide.
- **TRK-004** Task guidance: Select underlay & overlay → Track fiber bundle → Save fiber bundles.
- **TRK-005** Underlay: anatomical series, auto-registered to the diffusion input. Overlay: FA-direction colour map or fMRI SPMs (auto-registered). Changing the underlay when results exist asks for confirmation and deletes results.
- **TRK-006** Tracking: deterministic tensor streamlines with Minimum FA 0.20, Maximum angle change 45°, Minimum fiber length 10 mm *(NMR defaults)*; step 0.5 × smallest voxel dimension; 1 seed per voxel; trilinear tensor interpolation.
- **TRK-007** Fiber bundle settings dialog per bundle. A warning states that lowering FA or raising the angle limit produces spurious tracts and that defaults should be used where possible; a notice states that low SNR limits tracking.
- **TRK-008** ROI tools: Multi-ROI manual tracking (draw several ROIs, then Track; inclusion = AND) and Single-ROI auto tracking. Shapes: smoothed polygon, ellipse, freehand, seed 2D, seed 3D. Exclude (NOT) ROIs remove fibers passing through them.
- **TRK-009** "Single ROI in high density" option seeds neighbouring voxels for single-ROI tracking.
- **TRK-010** Follow mouse (fiber probing): hovering shows the streamline through the voxel under the cursor with its coordinates, FA and ADC.
- **TRK-011** Bundle manager tree (bundle → ROIs): visibility, select/focus, rename, colour or directional colour, edit, edit settings, exclude/include ROI, delete ROI, delete bundle.
- **TRK-012** Guidance panel (optional, collapsible) with original anatomical hints and ROI-placement images for corticospinal tract, arcuate fasciculus, optic radiation, corpus callosum, IFOF, uncinate fasciculus. Entries can be hidden from guidance.
- **TRK-013** Statistics panel: per bundle fiber count, mean length [mm], mean ± SD FA and ADC; per ROI voxel count, volume and mean FA/ADC. Export as CSV.
- **TRK-014** Save fiber bundles with the study. Batch reformats: parallel (start, end, axial/coronal/sagittal preset, number of images, increment [mm], thickness [mm]) and freestyle key-frame movie (speed, duration, frames). Save as DICOM (original or Secondary Capture with fibers) or movie with optional de-identification.
- **TRK-015** Export for surgical navigation as DICOM: combined (fused, optional transparency) or separate objects (distinct gray values per object; positive and negative SPM activation as separate objects). Requires the DTI to be registered to the chosen anatomical underlay. The export dialog shows a tractography-limitations notice (biophysical assumptions; correlate with anatomy, clinical data and intra-operative stimulation; residual misalignment possible; planning board should review).

---

## 10. Brain Function (fMRI)

- **FMRI-001** Input: BOLD T2*-weighted dynamic series (typically ≥ 80 dynamics, TR 2–4 s).
- **FMRI-002** On open, the BOLD series is registered automatically to the anatomical reference series chosen by site preference; "Review co-registration" opens the REG workspace.
- **FMRI-003** Analysis types: Block paradigm, Event paradigm, Resting state.
- **FMRI-004** Task guidance (block/event): Smoothing width → Anatomical underlay → Select paradigm and SPM tasks → Compute SPMs → Save SPMs. Resting state replaces paradigm selection with "Draw a reference ROI".
- **FMRI-005** Optional steps from More: Skip dummy dynamics (recompute required afterwards); show/hide smoothing step (shown by default); series selection for multi-session analysis.
- **FMRI-006** Smoothing width slider (mm), default twice the in-plane voxel size; a notice says to avoid smoothing when very small activations are expected.
- **FMRI-007** Paradigm manager: new, edit (type cannot change), copy, delete. Paradigm editor wizard: step 1 type (block or event) and unique name, block units (seconds or dynamics); step 2 configuration. Block: sequential or parallel blocks; task/rest blocks with colours from presets; drag edges to resize; delete block. Event: import an event file (BIDS-style TSV onset/duration/trial_type and a plain three-column format); per-analysis override of the event file.
- **FMRI-008** Resting state: an ROI drawn on anatomy defines the reference time course for the correlation map.
- **FMRI-009** Compute options: default brain mask (suppress outside-brain activation); "Suppress motion-related artifacts" (motion parameters as nuisance regressors), unavailable for series already motion-corrected on the scanner.
- **FMRI-010** SPM display: T-score overlay on anatomy; two-handle threshold on the colour bar; blending (alpha) %; positive only by default, optional negative T; colour preset per task; cluster-size filter (voxels); tiled slice layout with double-click for single slice.
- **FMRI-011** Time-intensity display for an activation cluster (whole 3D cluster by default, option for marked slice only) shown with the paradigm.
- **FMRI-012** Motion quality graph: translations x/y/z [mm] and rotations x/y/z [°] across dynamics, each toggleable.
- **FMRI-013** A warning states that the software cannot detect a wrong paradigm-to-data mapping and that the time-intensity display should be checked.
- **FMRI-014** Save SPMs as a named derived series. SPMs are available as overlay in Tractography (TRK-005).
- **FMRI-015** Accuracy: all ground-truth activation blobs detected at p < 0.001 uncorrected with no false clusters larger than 10 voxels at SNR 100.

---

## 11. Spectroscopy

- **MRS-001** Inputs: an SVS or CSI proton spectroscopy series plus at least one imaging series selected together; time- or frequency-domain data. Frequency-domain input is view-only (processing steps disabled).
- **MRS-002** Layout: spectrum viewer with metabolite table, and three reference views. SVS: three planning views with voxel box. CSI: one planning view plus two metabolite-map views, with grid overlay.
- **MRS-003** Reference (PRESS) box colour shows processing state: unprocessed / processing / processed. Only voxels whose centre lies inside the box are processed; without a localisation box, all grid voxels are shown.
- **MRS-004** Task guidance: Select anatomy (Brain) → Adjust phase → Specify metabolites → Save graphs and maps.
- **MRS-005** Voxel selection by click; zoom and pan in reference views; grid, mini-spectra and quality indicator toggles; align view to grid; orient to grid plane/rows/columns; colour scale and smoothing for metabolite maps.
- **MRS-006** Phase: automatic zero-order phase by default; manual coarse and fine sliders or typed degrees; Apply/Cancel. For CSI the correction is estimated on the central 3×3 voxels and propagated.
- **MRS-007** Spectrum viewer: actual, fitted spectrum, fitted baseline toggles; real or magnitude display; ppm axis (decreasing to the right).
- **MRS-008** Brain metabolites: NAA, Cr, Cr2, Cho, mI, sI, Glx, Lac, Lip (Lip1–Lip5), Ac. Defaults for maps: NAA, Cr, Cho, Cho/Cr, NAA/Cr, Cho/NAA; users add others.
- **MRS-009** Table per metabolite: position [ppm] with label, height, area, FWHM [ppm], SNR, area ratio.
- **MRS-010** Quality indicator per voxel from FWHM and SNR: water FWHM ≤ 0.10 ppm good, ≤ 0.16 moderate, else poor; other peaks ≤ 0.07 good, ≤ 0.14 moderate, else poor; SNR > 10 good, 5–10 moderate, < 5 poor. Overall quality = worst of linewidth and SNR classes (green / orange / red), with a legend.
- **MRS-011** FWHM uses the unsuppressed water reference if present, else the fitted water peak in the spectrum, else the highest non-lipid peak.
- **MRS-012** SNR = height of the largest metabolite peak (excluding water and lipid) / RMS of noise in a signal-free region.
- **MRS-013** Save graphs and metabolite/ratio maps as derived series.
- **MRS-014** Accuracy: metabolite ratios within 5 % on the spectral phantom.

---

## 12. Longitudinal Brain Analysis

### 12.1 Loading and hanging

- **LBA-001** Load 1–4 MR studies of one adult patient (multi-select in Directory). Patient ID mismatch → warning and explicit confirmation; demographics differences are listed (SAFE-021).
- **LBA-002** Each series is mapped to a data type from modality, DICOM attributes and description: FLAIR, T1, T2, ADC, DWI, SWI, MR (generic).
- **LBA-003** Data type editor: table (series number, study date, modality, description, data type); reassign to a compatible type; create user or site data types; delete own types (site types need admin role). New descriptions auto-map on future loads.
- **LBA-004** Presets = sets of hanging layouts that map data types to viewports. Factory presets are read-only; user/site presets can be created, renamed, edited, deleted. Preset editor has three columns: presets, hangings, viewport→data type.
- **LBA-005** Series list per study shows displayed/hidden/active state; drag a series onto a viewport to replace it.

### 12.2 Registration

- **LBA-010** Automatic inter-study registration runs in the background after load (rigid, brain-optimised), enabled automatically on success.
- **LBA-011** Controls: enable/disable registration, registration alignment (resample follow-ups into baseline geometry, with a note on blurring), re-apply registration after layout or series change.
- **LBA-012** Edit registration (enabled in Compare mode): fused main view plus three fused references; pan, rotate, fine-tune, undo/redo, reset; leaving the mode keeps and applies the refined transform for that pair.

### 12.3 Modes

- **LBA-020** Longitudinal mode: time points as columns ordered oldest → newest, linked navigation.
- **LBA-021** Single mode: one study fills the screen; previous/next time point.
- **LBA-022** Compare mode: Ctrl-select two same-type viewports from different time points → side-by-side with the change map as overlay (1×2 or 2×1), synchronised scroll/pan/zoom, overlay window and transparent range, colour map (red-blue linear or heat), three non-fused references.
- **LBA-023** Change-map subtraction fusion: bias-field correction → registration → intensity normalisation → subtraction; displayed on the baseline underlay; default threshold 10 % of the maximum difference range after removing 2 % outliers; opacity rises with |difference|. Deterministic for identical inputs.
- **LBA-024** A traffic-light indicator (amber/red) warns when compared series differ in resolution, orientation or contrast; clicking shows the reason. Notice: the change map highlights intensity differences only, cannot separate change from artifact or positioning, and is not a sole basis for diagnosis; requires ≥ 1 mm resolution for 1 mm sensitivity.
- **LBA-025** FLAIR* mode: user labels one series SWI/EPI and one FLAIR (or via data types); registration within the same time point; voxelwise product after normalisation; result shown beside both inputs in three planes or a 3×3 grid (pan/zoom linked by row, windowing by column). Recommended ≤ 1.5 mm slices. Save as new series.
- **LBA-026** Central-vein review (FLAIR* mode) follows the NAIMS consensus criteria (`ALGORITHMS.md` §9). The findings of the FLAIR* time point are listed; selecting one centres all nine views on it and shows its smallest diameter measured from its segmentation. The user gives each finding one mark:
  - **Present (CVS+)**: the user ticks a checklist of the five NAIMS vein criteria: (1) thin hypointense line or small hypointense dot; (2) visible in at least two perpendicular planes and as a thin line in at least one; (3) apparent diameter < 2 mm; (4) runs partly or entirely through the lesion; (5) central position in the lesion. Present is available only when all five are ticked.
  - **Absent (CVS−)**: no vein can be identified in the lesion.
  - **Indeterminate**: a vein-like structure that cannot be confirmed or ruled out, for example seen in one plane only or unclear.
  - **Excluded**, with one required reason from the NAIMS lesion exclusion criteria: lesion < 3 mm in diameter in any plane; confluent with another lesion; multiple distinct veins; lesion poorly visible (motion or other artifact). Excluded is a separate mark from Absent.

  Keys: 1 Present, 2 Absent, 3 Indeterminate, 4 Excluded (opens the reason list), N next unreviewed finding. The app never detects or marks veins itself; a one-line notice states that the marks are the user's reading and that the app does not detect veins. The SWI/EPI → FLAIR registration shows "Registration not reviewed" until the user reviews it (SAFE-070).
- **LBA-027** Central-vein summary for the time point: the count of each mark and of unreviewed findings; CVS+ percentage of evaluable lesions = CVS+ / (CVS+ + CVS−), with Indeterminate, Excluded and unreviewed findings outside the denominator ("—" when no lesion is evaluable); Select-3* and Select-6* shown as the CVS+ count against 3 and 6. The summary reports counts and percentages only and states no diagnosis. Marks, exclusion reasons and the summary are stored with the findings (LBA-037) and appear in the table export and the report.

### 12.4 Segmentation and findings

- **LBA-030** Seed-point segmentation: adaptive threshold from the cursor location, bright or dark lesions (`Shift`+wheel adjusts threshold), limiting sphere (`Ctrl`+wheel adjusts size), live preview on all views, click to commit.
- **LBA-031** Smart ROI: click-drag "balloon" that follows tissue boundaries.
- **LBA-032** `Shift`+click with seed-point segmentation propagates the lesion to other time points via registration, with preview; only when registration is enabled.
- **LBA-033** Editing: add to / remove from smart ROI, undo, redo; contour editing on hover; segmentation opacity slider; show/hide segmentation. A warning asks the user to verify every segmentation (and every propagated one).
- **LBA-034** New overlapping lesion on the same volume → choose merge or new finding.
- **LBA-035** Findings list per study: icon by type, name (≤ 5 chars shown), count of time points, presence in latest study. Select one to navigate all viewports to its long-axis slice; multi-select with drag or Ctrl.
- **LBA-036** Operations: Match (across time points; keeps the oldest name), Unmatch, Join (same time point), Properties, Delete (all studies).
- **LBA-037** Properties: name; type (Lesion, MS lesion, Tumor, Cavernoma, Bleeding, Edema); location from a list; change (New, Increased, Significantly increased, Decreased, Significantly decreased, Stable, Disappeared; Disappeared records volume 0); comments; history graph.
- **LBA-038** Radial context menu ("wheel") with tools for the current target; contents adapt to selection. All wheel actions are also in the panel or toolbar (GEN-004).

### 12.5 Results and output

- **LBA-040** Results stage: volume table (rows = lesions, columns = study dates oldest → newest, bottom total row) and graph of volume and total volume over time.
- **LBA-041** Copy table; export CSV; save selected image or display as DICOM SC or JPEG/TIFF/BMP; save results series (segmentations and registration reload at next follow-up); save batch.
- **LBA-042** Viewing tools: axial/coronal/sagittal/original orientation, link toggle, crosshair, relate viewports (jump to the same anatomical point in all studies; needs registration), same anatomy size, show references, annotations (line, angle, ellipse, pixel value, arrow+text, text), invert gray.
- **LBA-043** Accuracy: lesion volume change within 5 % for lesions ≥ 10 voxels on the longitudinal phantom.

---

## 13. Advanced Diffusion

- **ADV-001** Input: isotropic DWI with several b-values. Two modes: Computed DWI and Analyze diffusion signal. The last used mode reopens.
- **ADV-002** Computed DWI: 1×2 layout (source | cDWI). Model: mono-exponential (≥ 2 b), simplified IVIM (≥ 3 b), bi-exponential (≥ 4 b); default mono-exponential. b-value slider in steps of 100 s/mm² with typed entry. Automatic window adaptation; optional ADC-based window control with threshold default 600 × 10⁻⁶ mm²/s. Mask; generate series named with mode, model and registration flag.
- **ADV-003** Analyze signal: 2×2 layout (source with slices × b-values, maps, table, graph). Models and outputs: mono-exponential → D; simplified IVIM → D, f; bi-exponential → D, f, D*; kurtosis (mono) → D, K; kurtosis + simplified IVIM → D, f, K. A default model is proposed from the b-values.
- **ADV-004** Up to 10 ROIs across slices; table of mean parameters; graph of signal versus b with fitted curve and goodness of fit; click column → jump to slice; click curve → highlight b-values. Changing mode removes ROIs after a prompt to bookmark.
- **ADV-005** Goodness-of-fit map and per-ROI goodness-of-fit value.
- **ADV-006** Edit input b-values dialog disables choices that would break the selected model's minimum and states why.
- **ADV-007** Thresholds (More → Model thresholds): simplified-IVIM threshold default 100 s/mm² (b-values with 0 < b < threshold are excluded from simplified-IVIM models); kurtosis threshold default 800 s/mm², minimum 600 (kurtosis models need ≥ 1 b ≥ threshold). Changes last for the session only.
- **ADV-010** Model availability rules:

| Model | Required | Recommended |
|---|---|---|
| Mono-exponential | ≥ 2 b | IVIM thr ≤ b < kurtosis thr |
| Simplified IVIM | ≥ 3 b; b = 0 present; exclude 0 < b < IVIM thr | b < kurtosis thr |
| Bi-exponential | ≥ 4 b | b = 0 present; ≥ 1 b in (0, IVIM thr); b < kurtosis thr |
| Kurtosis (mono) | ≥ 3 b; ≥ 1 b ≥ kurtosis thr | b ≥ IVIM thr |
| Kurtosis + simplified IVIM | ≥ 4 b; b = 0 present; exclude 0 < b < IVIM thr; ≥ 1 b ≥ kurtosis thr | — |

- **ADV-011** Register while saving; generate series (SC and SC-RGB); measurement type and ROI statistics per §1.
- **ADV-012** Accuracy: fitted-signal NRMSE on the IVIM/DKI phantom at or below the per-model tolerances in `ALGORITHMS.md`; parameter recovery tolerances also listed there.

---

## 14. Subtraction

- **SUB-001** Operations on source S and reference R with weight W: S + W·R; S − W·R; relative subtraction (S − W·R) / ((S + W·R)/2); ratio S/R (no weight); magnetisation transfer ratio ((R − W·S)/R) × 100 [%].
- **SUB-002** Layout: three viewports — source (default dynamic 2), live result, reference (default dynamic 1).
- **SUB-003** Source and reference default to the launched series; either can be replaced; "Use other series as reference"; Swap.
- **SUB-004** Source range: default all dynamics except the first; range bar with draggable ends; context menu Set start / Set end dynamic (same dynamic → single).
- **SUB-005** Reference dynamic: default first; slider or "Set reference dynamic" from the context menu.
- **SUB-006** Weight factor checkbox and slider with live preview (hidden for Ratio).
- **SUB-007** Mask per input with optional link.
- **SUB-008** S and R must share slice positions, spacing, FOV and patient position; otherwise the operation is blocked with the mismatching attribute named.
- **SUB-009** Generate series with user name. Division by zero yields 0 and is counted in the status line.

## 15. Echo Accumulation

- **ECHO-001** Input: series with ≥ 2 echoes. Layout: source and live result.
- **ECHO-002** Range slider over echoes, default all echoes; result = voxelwise sum over the selected echoes.
- **ECHO-003** Generate series with user name.

---

## 16. Patient safety (cross-cutting)

- **SAFE-001** Patient banner (name, ID, sex, age, study date) visible in every window, including extension windows.
- **SAFE-010** Every exported image, report and Secondary Capture carries patient and study identifiers.
- **SAFE-020** Series from different patients cannot be combined in one session (one-line block message).
- **SAFE-021** Longitudinal load checks Patient ID and asks for confirmation when demographics differ.
- **SAFE-030** Results become **stale** the moment any input changes (ROI, mask, AIF, smoothing, registration, thresholds, selected b-values); stale tables and maps are visibly marked until recomputed, and stale results cannot be exported.
- **SAFE-040** R/L/A/P/S/I orientation markers on every 2D viewport; they follow mirror/flip/rotate and are never hidden.
- **SAFE-050** Every map shows name, units, scaling, LUT bar and window range.
- **SAFE-060** Results computed with non-default settings (smoothing, thresholds, AIF source, skipped dynamics, registration edits) are flagged in table, export and report.
- **SAFE-070** Registration that has not been reviewed by the user is labelled as such wherever derived results appear.
- **SAFE-080** Contextual safety notices (AIF quality, motion, registration verification, tractography limits, mismatch decision-support scope, change-map interpretation) appear where the action happens, are one sentence, and are actionable.
