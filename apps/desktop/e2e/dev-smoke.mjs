// Starts `electron-vite dev` (Vite dev server + Electron with the dev CSP) and checks the shell mounts.
// Guards against the dev CSP blocking the React Refresh preamble (dark empty window).
// Usage: node apps/desktop/e2e/dev-smoke.mjs     (Linux CI: xvfb-run -a node …)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMEOUT_MS = 60000;

const freePort = () => new Promise((res, rej) => {
  const s = createServer().once("error", rej).listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => res(port));
  });
});

const port = await freePort();
const profile = mkdtempSync(join(tmpdir(), "neuromr-dev-smoke-"));
const cli = join(appDir, "node_modules", "electron-vite", "bin", "electron-vite.js");
// CI runners have no GPU (see smoke.mjs).
const gpuFlags = process.env.CI ? ["--disable-gpu", "--disable-gpu-compositing"] : [];
const child = spawn(process.execPath, [cli, "dev", "--", `--remote-debugging-port=${port}`, ...gpuFlags], {
  cwd: appDir,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1", NEUROMR_USER_DATA: profile },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));

function stop() {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-child.pid, "SIGTERM");
}

async function connect() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`electron-vite dev exited early (${child.exitCode})`);
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Electron did not open a debugging port in time");
}

let browser;
try {
  browser = await connect();
  const deadline = Date.now() + TIMEOUT_MS;
  let page;
  while (!page && Date.now() < deadline) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("http"));
    if (!page) await new Promise((r) => setTimeout(r, 250));
  }
  if (!page) throw new Error("no renderer page loaded from the dev server");
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // The top bar is rendered by React, so its text proves the app mounted under the dev CSP.
  await page.locator(".topbar .brand").filter({ hasText: "NeuroMR-PRO" }).waitFor({ timeout: 30000 });
  await page.locator(".statusbar").filter({ hasText: "Version" }).waitFor({ timeout: 15000 });
  const csp = errors.filter((e) => /Content Security Policy/i.test(e));
  if (csp.length) throw new Error(`CSP violations in dev:\n${csp.join("\n")}`);
  console.log(`dev smoke ok · ${page.url()}`);
} catch (err) {
  console.error(`dev smoke FAILED: ${err instanceof Error ? err.message : err}\n--- electron-vite output ---\n${log.slice(-4000)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stop();
  setTimeout(() => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }), 1500);
}
