import { type ImportProgress, type IpcChannel, type IpcParsedRequest, type IpcResponse, type IpcResult, isIpcChannel, parseRequest, parseResponse } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";
import { BrowserWindow, app, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import type { DirectoryService } from "./directory/service.js";
import type { EngineSupervisor } from "./engine/supervisor.js";
import { imageAttributes, imagePixels, seriesStack } from "./viewer/viewer.js";

export const INVOKE_CHANNEL = "neuromr:invoke";

type Handler<C extends IpcChannel> = (request: IpcParsedRequest<C>, event: IpcMainInvokeEvent) => IpcResponse<C> | Promise<IpcResponse<C>>;
type Handlers = { [C in IpcChannel]: Handler<C> };

function windowState(win: BrowserWindow | null) {
  return { maximized: win?.isMaximized() ?? false, focused: win?.isFocused() ?? false };
}

let engine: EngineSupervisor | null = null;
let directory: DirectoryService | null = null;

function requireDirectory(): DirectoryService {
  if (!directory) throw new Error("study index is not open");
  return directory;
}

/** DIR-001: the user picks the source in main's own dialog, so the renderer never names a path. */
async function chooseImportSource(source: "folder" | "dicomdir", event: IpcMainInvokeEvent): Promise<string | undefined> {
  const options: OpenDialogOptions =
    source === "folder"
      ? { title: t("import.dialog.folder"), properties: ["openDirectory"] }
      : { title: t("import.dialog.dicomdir"), properties: ["openFile"], filters: [{ name: t("import.dialog.dicomdirFilter"), extensions: ["*"] }] };
  const win = BrowserWindow.fromWebContents(event.sender);
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return r.canceled ? undefined : r.filePaths[0];
}

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
  "directory:import": async ({ source }, event) => {
    const dir = requireDirectory();
    if (dir.busy()) return { started: false, why: "busy" };
    const root = await chooseImportSource(source, event);
    return root ? dir.startImport(source, root) : { started: false, why: "dismissed" };
  },
  "directory:cancel-import": () => ({ cancelled: requireDirectory().cancelImport() }),
  "directory:overview": () => requireDirectory().overview(),
  "directory:studies": ({ search }) => requireDirectory().index.studies(search),
  "directory:series": ({ studyInstanceUid }) => requireDirectory().index.series(studyInstanceUid),
  "directory:quarantine": () => requireDirectory().index.quarantine(),
  "viewer:stack": ({ seriesInstanceUid }) => seriesStack(requireDirectory().index, seriesInstanceUid),
  "viewer:pixels": ({ sopInstanceUid }) => {
    const d = requireDirectory();
    return imagePixels(d.index, sopInstanceUid, (path, frame) => d.pixels.image(path, frame));
  },
  "viewer:attributes": ({ sopInstanceUid }) => imageAttributes(requireDirectory().index, sopInstanceUid),
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
export function registerIpc(isAppUrl: (url: string) => boolean, supervisor: EngineSupervisor, studies: DirectoryService): void {
  engine = supervisor;
  directory = studies;
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

/** DIR-008: import progress reaches every window as it happens. */
export function broadcastImportProgress(p: ImportProgress): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send("neuromr:import-progress", p);
}
