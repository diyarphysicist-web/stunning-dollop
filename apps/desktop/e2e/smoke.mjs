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
function directoryFixture() {
  let phantoms = process.env.NEUROMR_SMOKE_DICOM;
  if (!phantoms) {
    phantoms = mkdtempSync(join(tmpdir(), "neuromr-phantoms-"));
    execFileSync("uv", ["run", "--project", "engine", "python", "scripts/make_phantoms.py", "--out", phantoms, "--only", "dce"], { cwd: repo, stdio: "inherit" });
  }
  const root = mkdtempSync(join(tmpdir(), "neuromr-import-"));
  for (const [i, folder] of ["dce_semiquant/dicom", "dce_tofts/dicom_dce", "dce_tofts/dicom_vfa5", "dce_tofts/dicom_vfa15"].entries()) {
    const src = join(phantoms, folder);
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

const { app, win } = await launch();
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
  const software = await win.locator("[data-testid=software-rendering]").count();
  console.log(`viewer ok · ${software ? "software rendering (GEN-235)" : "GPU rendering"}`);

  if (errors.length) throw new Error(`renderer errors:\n${errors.join("\n")}`);
  console.log(`smoke ok · api ${security.api.join(", ")} · ${join(outDir, "desktop-shell.png")}`);
} finally {
  await app.close();
}
