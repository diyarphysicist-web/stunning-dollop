import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tokens } from "@neuromr/ui";
import { BrowserWindow, app } from "electron";
import { forwardWindowState, registerIpc } from "./ipc.js";
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
  void app.whenReady().then(() => {
    hardenSession(devServerUrl);
    registerIpc(isAppUrl);
    createMainWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
