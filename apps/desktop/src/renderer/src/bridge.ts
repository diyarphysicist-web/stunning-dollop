import { type IpcChannel, type IpcRequest, type IpcResponse, type IpcResult, parseResponse } from "@neuromr/contracts";

/** Calls main through the preload bridge and validates the response before the UI sees it. */
export async function invoke<C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResult<IpcResponse<C>>> {
  const raw = await window.neuromr.invoke(channel, request);
  return raw.ok ? parseResponse(channel, raw.value) : raw;
}
