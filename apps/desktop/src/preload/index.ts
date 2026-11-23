import type { IpcChannel, IpcRequest, IpcResponse, IpcResult, WindowState } from "@neuromr/contracts";
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
};

export type NeuroMrApi = typeof api;
contextBridge.exposeInMainWorld("neuromr", api);
