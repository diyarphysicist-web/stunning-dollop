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
