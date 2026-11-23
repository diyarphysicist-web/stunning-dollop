import { type IpcChannel, type IpcParsedRequest, type IpcResponse, type IpcResult, isIpcChannel, parseRequest, parseResponse } from "@neuromr/contracts";
import { BrowserWindow, app, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { EngineSupervisor } from "./engine/supervisor.js";

export const INVOKE_CHANNEL = "neuromr:invoke";

type Handler<C extends IpcChannel> = (request: IpcParsedRequest<C>, event: IpcMainInvokeEvent) => IpcResponse<C> | Promise<IpcResponse<C>>;
type Handlers = { [C in IpcChannel]: Handler<C> };

function windowState(win: BrowserWindow | null) {
  return { maximized: win?.isMaximized() ?? false, focused: win?.isFocused() ?? false };
}

let engine: EngineSupervisor | null = null;

const handlers: Handlers = {
  "app:info": () => ({
    name: "NeuroMR-PRO",
    version: app.getVersion(),
    platform: process.platform as "win32" | "linux" | "darwin",
    arch: process.arch,
    electron: process.versions.electron,
  }),
  "window:control": ({ action }, event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (action === "minimize") win.minimize();
      else if (action === "toggle-maximize") {
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      }
      else if (action === "close") win.close();
    }
    return windowState(win);
  },
  "engine:status": () => engine?.getStatus() ?? { state: "stopped" },
  "engine:retry": () => engine?.retry() ?? { state: "stopped" },
};

async function dispatch<C extends IpcChannel>(channel: C, payload: unknown, event: IpcMainInvokeEvent): Promise<IpcResult<IpcResponse<C>>> {
  const req = parseRequest(channel, payload);
  if (!req.ok) return req;
  try {
    const handler = handlers[channel] as Handler<C>;
    return parseResponse(channel, await handler(req.value, event));
  } catch (err) {
    return { ok: false, code: "failed", message: err instanceof Error ? err.message : String(err) };
  }
}

/** One validated entry point; requests from frames other than the app's own are refused. */
export function registerIpc(isAppUrl: (url: string) => boolean, supervisor: EngineSupervisor): void {
  engine = supervisor;
  // GEN-221: every window sees engine state changes as they happen.
  supervisor.onStatus((status) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send("neuromr:engine-status", status);
  });
  ipcMain.handle(INVOKE_CHANNEL, (event, channel: unknown, payload: unknown) => {
    if (!event.senderFrame || !isAppUrl(event.senderFrame.url)) return { ok: false, code: "invalid-request", message: "untrusted sender" };
    if (!isIpcChannel(channel)) return { ok: false, code: "invalid-request", message: "unknown channel" };
    return dispatch(channel, payload, event);
  });
}

/** Pushes window state to the renderer so the maximise icon stays correct. */
export function forwardWindowState(win: BrowserWindow): void {
  const send = () => win.webContents.send("neuromr:window-state", windowState(win));
  for (const e of ["maximize", "unmaximize", "focus", "blur"] as const) win.on(e as "maximize", send);
}
