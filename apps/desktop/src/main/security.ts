import { type BrowserWindow, session } from "electron";

/** Strict CSP for the renderer: local bundle only, no remote code, no eval (product is fully offline). */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function hardenSession(devServerUrl: string | undefined): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  s.setPermissionCheckHandler(() => false);
  s.webRequest.onHeadersReceived((details, callback) => {
    // The dev server needs its HMR websocket; production loads from file:// only.
    const csp = devServerUrl ? `${CSP.replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")}` : CSP;
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
