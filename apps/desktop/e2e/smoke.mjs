// Launches the built app with Playwright, checks the shell and the IPC bridge, and saves a screenshot.
// Usage: node apps/desktop/e2e/smoke.mjs [outDir]   (Linux CI: xvfb-run node …)
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(appDir, "..", "..", "artifacts", "screens"));
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), "neuromr-smoke-"));
const app = await electron.launch({ args: [appDir], cwd: appDir, env: { ...process.env, NEUROMR_USER_DATA: profile } });
const errors = [];
try {
  const win = await app.firstWindow();
  win.on("pageerror", (e) => errors.push(String(e)));
  win.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1920, 1080));
  await win.waitForSelector(".statusbar .sb-item:has-text('Version')", { timeout: 15000 });

  const security = await win.evaluate(() => ({ require: typeof (globalThis).require, process: typeof (globalThis).process, api: Object.keys(window.neuromr ?? {}) }));
  if (security.require !== "undefined" || security.process !== "undefined") throw new Error(`Node exposed to renderer: ${JSON.stringify(security)}`);
  const bad = await win.evaluate(() => window.neuromr.invoke("fs:read", {}));
  if (bad.ok !== false) throw new Error("unknown IPC channel was accepted");
  const badReq = await win.evaluate(() => window.neuromr.invoke("window:control", { action: "devtools" }));
  if (badReq.ok !== false) throw new Error("invalid IPC request was accepted");

  await win.screenshot({ path: join(outDir, "desktop-shell.png") });
  if (errors.length) throw new Error(`renderer errors:\n${errors.join("\n")}`);
  console.log(`smoke ok · api ${security.api.join(", ")} · ${join(outDir, "desktop-shell.png")}`);
} finally {
  await app.close();
}
