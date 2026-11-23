import { z } from "zod";

/** Engine health handshake returned by GET /health with the per-session token. */
export const EngineHealth = z.object({
  status: z.literal("ok"),
  version: z.string(),
  pid: z.number().int().positive(),
});
export type EngineHealth = z.infer<typeof EngineHealth>;

/** Progress events streamed over WebSocket for long jobs (UX law 5: progress with cancel). */
export const JobEvent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("progress"), jobId: z.string(), fraction: z.number().min(0).max(1), stage: z.string() }),
  z.object({ kind: z.literal("done"), jobId: z.string() }),
  z.object({ kind: z.literal("cancelled"), jobId: z.string() }),
  z.object({ kind: z.literal("error"), jobId: z.string(), message: z.string() }),
]);
export type JobEvent = z.infer<typeof JobEvent>;

/** Restart schedule after an unexpected engine exit (GEN-222): 1, 2, 4, 8, 16 s. */
export const ENGINE_RESTART_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
/** A run that stays healthy this long resets the restart count (GEN-222). */
export const ENGINE_HEALTHY_RESET_MS = 60000;
/** Grace period for a clean exit on quit before the process tree is ended (GEN-224). */
export const ENGINE_STOP_GRACE_MS = 3000;

/** Engine state shown in the status bar (GEN-221). */
export const EngineStatus = z.discriminatedUnion("state", [
  z.object({ state: z.literal("starting") }),
  z.object({ state: z.literal("connected"), version: z.string().min(1), location: z.literal("local") }),
  z.object({ state: z.literal("restarting"), attempt: z.number().int().min(1).max(ENGINE_RESTART_DELAYS_MS.length) }),
  z.object({
    state: z.literal("unavailable"),
    reason: z.enum(["not-installed", "failed-to-start", "crashed-repeatedly"]),
    /** Technical detail for diagnostics; never shown as the user message. */
    detail: z.string(),
  }),
  z.object({ state: z.literal("stopped") }),
]);
export type EngineStatus = z.infer<typeof EngineStatus>;

/** Reply of POST /jobs. */
export const JobStarted = z.object({ jobId: z.string().min(1) });
