import { type BrowserWindow, session } from "electron";
import { buildCsp } from "./csp.js";


export function hardenSession(devServerUrl: string | undefined): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  const csp = buildCsp(devServerUrl);
  s.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] } });
  });
}

/** No navigation away from the app and no new windows from page content. */
export function lockNavigation(win: BrowserWindow, isAppUrl: (url: string) => boolean): void {
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
}
