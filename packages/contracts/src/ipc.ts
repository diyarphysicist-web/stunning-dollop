import { z } from "zod";

/** Build and platform facts the renderer shows in the status bar and About (GEN-200 strings stay in the catalog). */
export const AppInfo = z.object({
  name: z.literal("NeuroMR-PRO"),
  version: z.string().min(1),
  platform: z.enum(["win32", "linux", "darwin"]),
  arch: z.string().min(1),
  electron: z.string().min(1),
});
export type AppInfo = z.infer<typeof AppInfo>;

const Empty = z.object({}).strict();

/**
 * Every renderer → main request. Main validates the request and the renderer validates the
 * response, so a malformed message never crosses the process boundary in either direction.
 */
export const IPC = {
  "app:info": { request: Empty, response: AppInfo },
} as const;

export type IpcChannel = keyof typeof IPC;
export type IpcRequest<C extends IpcChannel> = z.input<(typeof IPC)[C]["request"]>;
export type IpcParsedRequest<C extends IpcChannel> = z.output<(typeof IPC)[C]["request"]>;
export type IpcResponse<C extends IpcChannel> = z.output<(typeof IPC)[C]["response"]>;

/** Error shape returned instead of throwing across the bridge. */
export const IpcFailure = z.object({ ok: z.literal(false), code: z.enum(["invalid-request", "invalid-response", "failed"]), message: z.string() });
export type IpcFailure = z.infer<typeof IpcFailure>;
export type IpcResult<T> = { ok: true; value: T } | IpcFailure;

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === "string" && Object.hasOwn(IPC, value);
}

/** Validates a request for `channel`; used by the main process before any handler runs. */
export function parseRequest<C extends IpcChannel>(channel: C, payload: unknown): IpcResult<IpcParsedRequest<C>> {
  const r = IPC[channel].request.safeParse(payload);
  return r.success ? { ok: true, value: r.data as IpcParsedRequest<C> } : { ok: false, code: "invalid-request", message: r.error.message };
}

/** Validates a response for `channel`; used on both sides of the bridge. */
export function parseResponse<C extends IpcChannel>(channel: C, payload: unknown): IpcResult<IpcResponse<C>> {
  const r = IPC[channel].response.safeParse(payload);
  return r.success ? { ok: true, value: r.data as IpcResponse<C> } : { ok: false, code: "invalid-response", message: r.error.message };
}
