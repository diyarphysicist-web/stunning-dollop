import type { EngineStatus, ImportProgress, IpcChannel, IpcRequest, IpcResponse, IpcResult, WindowState } from "@neuromr/contracts";
import { contextBridge, ipcRenderer } from "electron";

/** The only API the renderer sees. Requests are validated again in main; responses in the renderer. */
const api = {
  invoke<C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResult<IpcResponse<C>>> {
    return ipcRenderer.invoke("neuromr:invoke", channel, request) as Promise<IpcResult<IpcResponse<C>>>;
  },
  onWindowState(listener: (state: WindowState) => void): () => void {
    const wrapped = (_e: unknown, state: WindowState) => listener(state);
    ipcRenderer.on("neuromr:window-state", wrapped);
    return () => ipcRenderer.off("neuromr:window-state", wrapped);
  },
  /** Engine state pushes (GEN-221); the renderer validates each one with the EngineStatus schema. */
  onEngineStatus(listener: (status: EngineStatus) => void): () => void {
    const wrapped = (_e: unknown, status: EngineStatus) => listener(status);
    ipcRenderer.on("neuromr:engine-status", wrapped);
    return () => ipcRenderer.off("neuromr:engine-status", wrapped);
  },
  /** Import progress pushes (DIR-008); validated with the ImportProgress schema in the renderer. */
  onImportProgress(listener: (progress: ImportProgress) => void): () => void {
    const wrapped = (_e: unknown, progress: ImportProgress) => listener(progress);
    ipcRenderer.on("neuromr:import-progress", wrapped);
    return () => ipcRenderer.off("neuromr:import-progress", wrapped);
  },
};

export type NeuroMrApi = typeof api;
contextBridge.exposeInMainWorld("neuromr", api);
