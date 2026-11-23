import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tokens } from "@neuromr/ui";
import { BrowserWindow, app } from "electron";
import { EngineSupervisor } from "./engine/supervisor.js";
import { nodeDeps, resolveEngineCommand } from "./engine/runtime.js";
import { DirectoryService } from "./directory/service.js";
import { broadcastImportProgress, forwardWindowState, registerIpc } from "./ipc.js";
import { hardenSession, lockNavigation } from "./security.js";

const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
const rendererFile = join(import.meta.dirname, "../renderer/index.html");
const rendererUrl = pathToFileURL(rendererFile).href;

function isAppUrl(url: string): boolean {
  return devServerUrl ? url.startsWith(devServerUrl) : url === rendererUrl || url.startsWith(`${rendererUrl}#`);
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: tokens.colorBg,
    title: "NeuroMR-PRO",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  lockNavigation(win, isAppUrl);
  forwardWindowState(win);
  win.once("ready-to-show", () => win.show());
  if (devServerUrl) void win.loadURL(devServerUrl);
  else void win.loadFile(rendererFile);
  return win;
}

// Test runs use their own profile so they never collide with an open NeuroMR-PRO window.
const profileOverride = process.env["NEUROMR_USER_DATA"];
if (profileOverride) app.setPath("userData", profileOverride);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  const engine = new EngineSupervisor(
    nodeDeps(
      () => resolveEngineCommand({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() }),
      (line) => console.log(line),
    ),
  );
  let directory: DirectoryService | null = null;
  void app.whenReady().then(() => {
    hardenSession(devServerUrl);
    directory = new DirectoryService(app.getPath("userData"), join(import.meta.dirname, "import-worker.js"), broadcastImportProgress);
    registerIpc(isAppUrl, engine, directory);
    engine.start();
    createMainWindow();
  });
  app.on("window-all-closed", () => app.quit());
  // GEN-224: no engine process outlives the application.
  let engineStopped = false;
  app.on("before-quit", (event) => {
    if (engineStopped) return;
    event.preventDefault();
    void Promise.all([engine.stop(), directory?.stop()]).finally(() => {
      engineStopped = true;
      app.quit();
    });
  });
}
