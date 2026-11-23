// Launches the built app with Playwright, checks the shell and the IPC bridge, and saves a screenshot.
// Usage: node apps/desktop/e2e/smoke.mjs [outDir]   (Linux CI: xvfb-run node …)
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

/* global document -- the viewer checks run inside the page (waitForFunction) */

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(appDir, "..", "..", "artifacts", "screens"));
mkdirSync(outDir, { recursive: true });

const repo = resolve(appDir, "..", "..");

/**
 * DICOM for the Directory checks: the DCE phantoms (semi-quantitative series, permeability series and
 * two VFA references), plus one truncated copy and one text file. NEUROMR_SMOKE_DICOM points at an
 * existing phantom folder (local runs); otherwise the phantoms are generated with uv (CI).
 */
let phantomRoot = process.env.NEUROMR_SMOKE_DICOM;
function phantoms() {
  if (!phantomRoot) {
    phantomRoot = mkdtempSync(join(tmpdir(), "neuromr-phantoms-"));
    execFileSync("uv", ["run", "--project", "engine", "python", "scripts/make_phantoms.py", "--out", phantomRoot, "--only", "dce,codecs,enhanced"], { cwd: repo, stdio: "inherit" });
  }
  return phantomRoot;
}

/** GEN-238: one series per compressed transfer syntax (codec phantoms). */
const CODEC_SERIES = ["rle", "jpeg-baseline", "jpeg-extended", "jpeg-lossless", "jpeg-lossless-sv1", "jpeg-ls", "jpeg-ls-near", "j2k-lossless", "j2k"];
function codecFixture() {
  const root = mkdtempSync(join(tmpdir(), "neuromr-codecs-"));
  for (const key of CODEC_SERIES) {
    const src = join(phantoms(), "codecs", key);
    mkdirSync(join(root, key));
    for (const f of readdirSync(src)) copyFileSync(join(src, f), join(root, key, f));
  }
  return root;
}

/** GEN-240: the enhanced phantom study (classic and multi-frame copies of DSC, DTI and multi-echo). */
function enhancedFixture() {
  const root = mkdtempSync(join(tmpdir(), "neuromr-enhanced-"));
  for (const kind of ["dsc", "dti", "echo"]) {
    for (const variant of ["classic", "enhanced"]) {
      const src = join(phantoms(), "enhanced", kind, variant);
      const dst = join(root, `${kind}-${variant}`);
      mkdirSync(dst);
      for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dst, f));
    }
  }
  return root;
}

function directoryFixture() {
  const root = mkdtempSync(join(tmpdir(), "neuromr-import-"));
  for (const [i, folder] of ["dce_semiquant/dicom", "dce_tofts/dicom_dce", "dce_tofts/dicom_vfa5", "dce_tofts/dicom_vfa15"].entries()) {
    const src = join(phantoms(), folder);
    mkdirSync(join(root, `s${i}`));
    for (const f of readdirSync(src)) copyFileSync(join(src, f), join(root, `s${i}`, f));
  }
  const sample = readFileSync(join(root, "s0", readdirSync(join(root, "s0"))[0]));
  writeFileSync(join(root, "broken.dcm"), sample.subarray(0, sample.length - 1000));
  writeFileSync(join(root, "notes.txt"), "not an image");
  return root;
}

/**
 * Screenshot once a frame has been painted. Under Xvfb, Chromium sometimes has no frame yet
 * ("Unable to capture screenshot"); wait for two animation frames and retry a few times.
 */
async function shot(win, name) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await win.screenshot({ path: join(outDir, name) });
      return;
    } catch (err) {
      last = err;
      console.warn(`screenshot ${name} attempt ${attempt} failed: ${err.message.split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw last;
}

/** Fails with a clear message if the renderer process dies, instead of a later protocol error. */
function watchCrash(win) {
  win.on("crash", () => console.error("renderer process crashed"));
}

// CI runners have no GPU: Chromium's software path under Xvfb is what produces capturable frames.
const CHROMIUM_FLAGS = process.env.CI ? ["--disable-gpu", "--disable-gpu-compositing"] : [];

/** Launches the built app and returns it once its window is shown at 1920 × 1080 and has painted. */
async function launch(env = {}) {
  const app = await electron.launch({ args: [appDir, ...CHROMIUM_FLAGS], cwd: appDir, env: { ...process.env, NEUROMR_USER_DATA: mkdtempSync(join(tmpdir(), "neuromr-smoke-")), ...env } });
  const win = await app.firstWindow();
  watchCrash(win);
  const deadline = Date.now() + 15000;
  while (!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false))) {
    if (Date.now() > deadline) throw new Error("main window was never shown");
    await new Promise((r) => setTimeout(r, 100));
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1920, 1080));
  return { app, win };
}

// GEN-221: without an engine the status bar says so in one actionable sentence.
{
  const { app, win } = await launch({ NEUROMR_ENGINE_PYTHON: join(appDir, "no-such-python.exe") });
  try {
    await win.locator("[data-engine-state=unavailable]").filter({ hasText: "Reinstall NeuroMR-PRO" }).waitFor({ timeout: 15000 });
    await shot(win, "desktop-shell-engine-unavailable.png");
  } finally {
    await app.close();
  }
}

// One profile for the main run and the restart below (GEN-241: sessions survive a restart).
const profile = mkdtempSync(join(tmpdir(), "neuromr-smoke-"));
const { app, win } = await launch({ NEUROMR_USER_DATA: profile });
const errors = [];
try {
  win.on("pageerror", (e) => errors.push(String(e)));
  win.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await win.waitForSelector(".statusbar .sb-item:has-text('Version')", { timeout: 15000 });
  // GEN-220/221: the real engine starts and answers its health check.
  await win.locator("[data-engine-state=connected]").filter({ hasText: "connected · local" }).waitFor({ timeout: 60000 });

  const security = await win.evaluate(() => ({ require: typeof (globalThis).require, process: typeof (globalThis).process, api: Object.keys(window.neuromr ?? {}) }));
  if (security.require !== "undefined" || security.process !== "undefined") throw new Error(`Node exposed to renderer: ${JSON.stringify(security)}`);
  const bad = await win.evaluate(() => window.neuromr.invoke("fs:read", {}));
  if (bad.ok !== false) throw new Error("unknown IPC channel was accepted");
  const badReq = await win.evaluate(() => window.neuromr.invoke("window:control", { action: "devtools" }));
  if (badReq.ok !== false) throw new Error("invalid IPC request was accepted");

  // DIR-001…009: empty store, folder import through main's dialog, classification, quarantine, duplicates, search.
  await win.locator("[data-testid=directory-empty]").waitFor({ timeout: 15000 });
  await shot(win, "desktop-shell.png");
  const fixture = directoryFixture();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, fixture);
  await win.keyboard.press("Control+o");
  const summary = win.locator("[data-testid=import-summary]");
  await summary.waitFor({ timeout: 120000 });
  const summaryText = await summary.innerText();
  if (!/ 0 already in the store · 1 not DICOM/.test(summaryText)) throw new Error(`unexpected import summary: ${summaryText}`);
  const rows = win.locator("[data-testid=series-list] tbody tr");
  if ((await rows.count()) !== 4) throw new Error(`expected 4 series, got ${await rows.count()}`);
  const badges = await win.locator("[data-testid=series-list] .type").allInnerTexts();
  for (const b of ["DCE", "T1", "VFA ref"]) if (!badges.includes(b)) throw new Error(`series type ${b} missing: ${badges.join(",")}`);
  if ((await win.locator("[data-testid=series-list] .thumb img").count()) !== 4) throw new Error("thumbnails missing");
  await win.locator("[data-testid=patient-banner]").filter({ hasText: "NMR-PHANTOM-001" }).waitFor();
  await shot(win, "desktop-directory.png");
  await win.locator("[data-testid=quarantine-notice] button").click();
  await win.locator("[data-testid=quarantine-list]").filter({ hasText: "broken.dcm" }).waitFor();
  await shot(win, "desktop-directory-quarantine.png");
  await win.keyboard.press("Escape");
  // DIR-007: the same folder again adds nothing.
  await win.keyboard.press("Control+o");
  await win.locator("[data-testid=import-summary]").filter({ hasText: "0 added" }).waitFor({ timeout: 120000 });
  // DIR-009: search filters the study list.
  await win.keyboard.press("Control+k");
  await win.keyboard.type("nobody-like-this");
  await win.locator("[data-testid=study-list] tbody tr").first().waitFor({ state: "detached" });
  await win.keyboard.press("Control+a");
  await win.keyboard.type("phantom");
  await win.locator("[data-testid=study-list] tbody tr").first().waitFor();
  if (!existsSync(fixture)) throw new Error("fixture vanished");

  // GEN-230…235: open two series from the Directory in the Viewer, one per viewport.
  const seriesRows = win.locator("[data-testid=series-list] tbody tr");
  await seriesRows.nth(0).click();
  await seriesRows.nth(2).click({ modifiers: ["Control"] });
  await win.locator("[data-testid=series-list]").press("Enter");
  const vp0 = win.locator("[data-testid=viewport-0][data-state=ready]");
  await vp0.waitFor({ timeout: 30000 });
  await win.locator("[data-testid=viewport-1][data-state=ready]").waitFor({ timeout: 30000 });
  if ((await win.locator(".vgrid").getAttribute("data-layout")) !== "1x2") throw new Error("two series should open side by side");
  // GEN-237: the status bar names the open study and series.
  await win.locator("[data-testid=status-open]").filter({ hasText: /Study .+ · #\d+ .+ · 2 series shown/ }).waitFor({ timeout: 5000 });
  // SAFE-040: markers on all four edges of an axial image, radiological convention.
  const markers = async () => Promise.all(["n", "e", "s", "w"].map((d) => win.locator(`[data-testid=viewport-0] [data-testid=orient-${d}]`).innerText()));
  if ((await markers()).join("") !== "ALPR") throw new Error(`unexpected markers ${await markers()}`);
  // GEN-021: ↓ moves to the next slice of the active viewport.
  const position = win.locator("[data-testid=viewport-0] [data-testid=overlay-position]");
  const before = await position.evaluate((el) => el.textContent);
  await vp0.click();
  await win.keyboard.press("ArrowDown");
  await win.waitForFunction((b) => document.querySelector("[data-testid=viewport-0] [data-testid=overlay-position]")?.textContent !== b, before);
  // GEN-130 + SAFE-040: mirroring swaps the left and right markers (read back from the rendered camera).
  await win.keyboard.press("h");
  await win.waitForFunction(() => document.querySelector("[data-testid=viewport-0] [data-testid=orient-w]")?.textContent === "L");
  if ((await markers()).join("") !== "ARPL") throw new Error(`mirrored markers ${await markers()}`);
  await win.keyboard.press("h");
  await win.waitForFunction(() => document.querySelector("[data-testid=viewport-0] [data-testid=orient-w]")?.textContent === "R", null, { timeout: 5000 });
  // "Rotate 90° clockwise" moves the patient's right (screen left) to the top.
  await win.keyboard.press("]");
  await win.waitForFunction(() => document.querySelector("[data-testid=viewport-0] [data-testid=orient-n]")?.textContent === "R", null, { timeout: 5000 }).catch(async () => {
    throw new Error(`clockwise rotation shows ${await markers()}`);
  });
  await win.keyboard.press("[");
  await win.waitForFunction(() => document.querySelector("[data-testid=viewport-0] [data-testid=orient-n]")?.textContent === "A", null, { timeout: 5000 });
  // GEN-010: a Window/Level drag changes the window shown in the overlay.
  const windowText = win.locator("[data-testid=viewport-0] [data-testid=overlay-window]");
  const w0 = await windowText.innerText();
  await win.keyboard.press("w");
  const box = await vp0.locator(".vp__canvas").boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.mouse.down();
  await win.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 4 });
  await win.mouse.up();
  if ((await windowText.innerText()) === w0) throw new Error("window drag did not change the window");
  // GEN-233: the inspector lists the current image's attributes.
  await win.locator("[data-testid=dicom-tags]").filter({ hasText: "RepetitionTime" }).waitFor();
  await shot(win, "desktop-viewer.png");

  // GEN-030…034, GEN-236: ellipse from three clicks, freehand drag, statistics, undo/redo, rename, slice binding.
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const labels = win.locator("[data-testid=viewport-0] [data-testid=roi-label]");
  await win.keyboard.press("e");
  for (const [dx, dy] of [[-40, 0], [40, 0], [0, 25]]) await win.mouse.click(c.x + dx, c.y + dy);
  await labels.filter({ hasText: "ROI1" }).waitFor({ timeout: 5000 });
  await win.locator("[data-testid=roi-stats] li[data-roi=ROI1] [data-testid=roi-mean]").waitFor({ timeout: 5000 });
  await win.keyboard.press("f");
  await win.mouse.move(c.x - 60, c.y - 60);
  await win.mouse.down();
  for (const [dx, dy] of [[-20, -60], [-20, -20], [-60, -20], [-60, -60]]) await win.mouse.move(c.x + dx, c.y + dy, { steps: 5 });
  await win.mouse.up();
  await labels.filter({ hasText: "ROI2" }).waitFor({ timeout: 5000 });
  await win.keyboard.press("Control+z");
  await labels.filter({ hasText: "ROI2" }).waitFor({ state: "detached", timeout: 5000 });
  await win.keyboard.press("Control+y");
  await labels.filter({ hasText: "ROI2" }).waitFor({ timeout: 5000 });
  await labels.filter({ hasText: "ROI1" }).dblclick();
  await win.keyboard.press("Control+a");
  await win.keyboard.type("Lesion");
  await win.keyboard.press("Enter");
  await labels.filter({ hasText: "Lesion" }).waitFor({ timeout: 5000 });
  await win.keyboard.press("s");
  await shot(win, "desktop-viewer-roi.png");
  // GEN-236: ROIs belong to their slice.
  await win.keyboard.press("ArrowUp");
  await labels.first().waitFor({ state: "detached", timeout: 5000 });
  await win.locator("[data-testid=roi-stats]").filter({ hasText: "2 ROIs on other slices" }).waitFor({ timeout: 5000 });
  await win.keyboard.press("ArrowDown");
  await labels.filter({ hasText: "Lesion" }).waitFor({ timeout: 5000 });
  // GEN-236: ROIs belong to the series: shown in the second viewport, the series brings them along.
  const vp1 = win.locator("[data-testid=viewport-1] .vp__canvas");
  await vp1.click();
  await win.locator("[data-testid=viewer-series] li").first().click();
  await win.locator("[data-testid=viewport-1][data-state=ready] [data-testid=overlay-position]").waitFor({ timeout: 30000 });
  await win.keyboard.press("ArrowDown");
  await win.locator("[data-testid=viewport-1] [data-testid=roi-label]").filter({ hasText: "Lesion" }).waitFor({ timeout: 5000 });
  // GEN-238/239: every compressed syntax imports with a thumbnail and displays; lossy ones say so.
  const codecs = codecFixture();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, codecs);
  await win.keyboard.press("Control+1");
  await win.keyboard.press("Control+o");
  await win.locator("[data-testid=import-summary]").filter({ hasText: `${CODEC_SERIES.length * 3} added` }).waitFor({ timeout: 120000 });
  await win.locator("[data-testid=study-list] tbody tr").filter({ hasText: "codec" }).click();
  const codecRows = win.locator("[data-testid=series-list] tbody tr");
  await codecRows.nth(CODEC_SERIES.length - 1).waitFor();
  if ((await codecRows.count()) !== CODEC_SERIES.length) throw new Error(`expected ${CODEC_SERIES.length} codec series, got ${await codecRows.count()}`);
  if ((await win.locator("[data-testid=series-list] .thumb img").count()) !== CODEC_SERIES.length) throw new Error("codec thumbnails missing");
  if ((await win.locator("[data-testid=series-lossy]").count()) !== 4) throw new Error(`expected 4 lossy series, got ${await win.locator("[data-testid=series-lossy]").count()}`);
  await shot(win, "desktop-directory-codecs.png");
  await codecRows.nth(0).click();
  await codecRows.nth(CODEC_SERIES.length - 1).click({ modifiers: ["Shift"] });
  await win.locator("[data-testid=series-list]").press("Enter");
  for (let i = 0; i < CODEC_SERIES.length; i++) {
    // The overlay appears once the first image of the viewport has been decoded and rendered.
    await win.locator(`[data-testid=viewport-${i}][data-state=ready] [data-testid=overlay-position]`).waitFor({ timeout: 30000 }).catch(async () => {
      throw new Error(`codec viewport ${i} is ${await win.locator(`[data-testid=viewport-${i}]`).getAttribute("data-state")}; renderer errors: ${errors.join(" | ")}`);
    });
  }
  const lossyShown = await win.locator("[data-testid=overlay-lossy]").count();
  if (lossyShown !== 4) throw new Error(`expected 4 lossy overlays, got ${lossyShown}`);
  await shot(win, "desktop-viewer-codecs.png");

  // GEN-240: enhanced multi-frame series classify and display like their classic twins.
  const enhanced = enhancedFixture();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, enhanced);
  await win.keyboard.press("Control+1");
  await win.keyboard.press("Control+o");
  await win.locator("[data-testid=import-summary]").filter({ hasText: /\d+ added/ }).filter({ hasNotText: "27 added" }).waitFor({ timeout: 120000 });
  await win.locator("[data-testid=study-list] tbody tr").filter({ hasText: "enhanced" }).click();
  const enhRows = win.locator("[data-testid=series-list] tbody tr");
  await enhRows.nth(5).waitFor();
  const dscRows = enhRows.filter({ hasText: "DSC perf" });
  if ((await dscRows.count()) !== 2) throw new Error("classic and enhanced DSC series expected");
  for (const r of await dscRows.all()) if (!(await r.locator(".type").allInnerTexts()).includes("DSC")) throw new Error("enhanced DSC not classified as DSC");
  const dtiRows = enhRows.filter({ hasText: "DTI" });
  for (const r of await dtiRows.all()) if (!(await r.locator(".type").allInnerTexts()).includes("DTI")) throw new Error("enhanced DTI not classified as DTI");
  if ((await win.locator("[data-testid=series-list] .thumb img").count()) !== 6) throw new Error("enhanced thumbnails missing");
  await shot(win, "desktop-directory-enhanced.png");
  await dscRows.nth(0).click();
  await dscRows.nth(1).click({ modifiers: ["Control"] });
  await win.locator("[data-testid=series-list]").press("Enter");
  const overlay = (i) => win.locator(`[data-testid=viewport-${i}][data-state=ready] [data-testid=overlay-position]`);
  await overlay(0).waitFor({ timeout: 30000 });
  await overlay(1).waitFor({ timeout: 30000 });
  const strip = (t) => t.replace(/^DSC perf (classic|multi-frame) · /, "");
  const [o0, o1] = [strip(await overlay(0).innerText()), strip(await overlay(1).innerText())];
  if (o0 !== o1) throw new Error(`classic and enhanced overlays differ: ${o0} / ${o1}`);
  await shot(win, "desktop-viewer-enhanced.png");

  const software = await win.locator("[data-testid=software-rendering]").count();
  console.log(`viewer ok · ${software ? "software rendering (GEN-235)" : "GPU rendering"}`);

  if (errors.length) throw new Error(`renderer errors:\n${errors.join("\n")}`);
  console.log(`smoke ok · api ${security.api.join(", ")} · ${join(outDir, "desktop-shell.png")}`);
} finally {
  await app.close();
}

// GEN-241: after a restart, reopening the validation study brings back its layout, series and ROIs.
{
  const { app: again, win: w } = await launch({ NEUROMR_USER_DATA: profile });
  try {
    const row = w.locator("[data-testid=study-list] tbody tr").filter({ hasText: "validation" });
    await row.waitFor({ timeout: 15000 });
    await row.dblclick();
    await w.locator("[data-testid=viewport-0][data-state=ready] [data-testid=overlay-position]").waitFor({ timeout: 30000 });
    if ((await w.locator(".vgrid").getAttribute("data-layout")) !== "1x2") throw new Error("the saved 1x2 layout did not come back");
    for (const i of [0, 1]) await w.locator(`[data-testid=viewport-${i}] [data-testid=roi-label]`).filter({ hasText: "Lesion" }).waitFor({ timeout: 10000 });
    await shot(w, "desktop-viewer-session.png");
    console.log("session restore ok");
    // GEN-242: save a bookmark, move away, restore it; rename and delete from its context menu.
    const labels0 = w.locator("[data-testid=viewport-0] [data-testid=roi-label]");
    await w.locator("[data-testid=viewport-0] .vp__canvas").click();
    await w.keyboard.press("Control+Shift+B");
    const bookmark = w.locator("[data-testid=bookmark]").filter({ hasText: "Bookmark 1" });
    await bookmark.waitFor({ timeout: 5000 });
    await w.locator("[data-testid=viewport-0] .vp__canvas").click();
    await w.keyboard.press("ArrowUp");
    await labels0.first().waitFor({ state: "detached", timeout: 5000 });
    await bookmark.click();
    await labels0.filter({ hasText: "Lesion" }).waitFor({ timeout: 10000 });
    await bookmark.click({ button: "right" });
    await w.locator("[data-testid=bookmark-menu] [role=menuitem]").first().click();
    await w.keyboard.press("Control+a");
    await w.keyboard.type("Baseline");
    await w.keyboard.press("Enter");
    const renamed = w.locator("[data-testid=bookmark]").filter({ hasText: "Baseline" });
    await renamed.waitFor({ timeout: 5000 });
    await shot(w, "desktop-viewer-bookmarks.png");
    await renamed.click({ button: "right" });
    await w.locator("[data-testid=bookmark-menu] [role=menuitem]").nth(1).click();
    await renamed.waitFor({ state: "detached", timeout: 5000 });
    console.log("bookmarks ok");

    // GEN-244: Reset all asks first, removes the series' ROIs, and Ctrl+Z brings them back.
    await w.locator("[data-testid=viewport-0] .vp__canvas").click({ button: "right" });
    await w.locator("[data-testid=viewport-menu] [role=menuitem]").filter({ hasText: "Reset all" }).click();
    const dialog = w.locator("[data-testid=reset-all-dialog]");
    await dialog.waitFor({ timeout: 5000 });
    if (!/2 ROIs/.test(await dialog.innerText())) throw new Error("Reset all does not name the ROIs it removes");
    await shot(w, "desktop-viewer-reset-all.png");
    await w.locator("[data-testid=reset-all-confirm]").click();
    await labels0.first().waitFor({ state: "detached", timeout: 5000 });
    await w.keyboard.press("Control+z");
    await labels0.filter({ hasText: "Lesion" }).waitFor({ timeout: 5000 });
    console.log("reset all ok");
  } finally {
    await again.close();
  }
}
