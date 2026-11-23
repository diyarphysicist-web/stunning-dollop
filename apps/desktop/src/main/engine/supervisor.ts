import {
  ENGINE_HEALTHY_RESET_MS,
  ENGINE_RESTART_DELAYS_MS,
  ENGINE_STOP_GRACE_MS,
  EngineHealth,
  type EngineStatus,
  JobEvent,
  JobStarted,
} from "@neuromr/contracts";
import { randomBytes } from "node:crypto";
import type { ChildProcess, SpawnOptions } from "node:child_process";

/** How to start the engine, or why it cannot be started (GEN-221 "not-installed"). */
export type EngineCommand = { file: string; args: string[]; cwd: string } | { error: string };

/** Minimal WebSocket surface (Node's global WebSocket satisfies it). */
export interface EventSocket {
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface SupervisorDeps {
  command(): EngineCommand;
  spawn(file: string, args: string[], options: SpawnOptions): ChildProcess;
  fetch(url: string, init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  openSocket(url: string, protocols: string[]): EventSocket;
  /** Ends the engine and any child it started (the Windows venv launcher starts the real interpreter). */
  killTree(pid: number): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  log(line: string): void;
}

export const READY_PREFIX = "NEUROMR_ENGINE_READY ";
const WS_PROTOCOL = "neuromr.v1";
const READY_TIMEOUT_MS = 30000;
const ENGINE_STOPPED_MESSAGE = "The engine stopped while this job was running.";

type Listener<T> = (value: T) => void;

/**
 * Starts, watches, restarts and stops the compute engine (GEN-220…224).
 * The token is new for every start and travels only over the child's stdin.
 */
export class EngineSupervisor {
  private status: EngineStatus = { state: "stopped" };
  private child: ChildProcess | null = null;
  private socket: EventSocket | null = null;
  private token = "";
  private port = 0;
  private failures = 0;
  private healthySince = 0;
  private stopping = false;
  /** Whether the engine reached "connected" since the last start() (decides the unavailable reason). */
  private everConnected = false;
  private restartTimer: unknown = null;
  private readyTimer: unknown = null;
  private generation = 0;
  private readonly running = new Set<string>();
  private readonly statusListeners = new Set<Listener<EngineStatus>>();
  private readonly jobListeners = new Set<Listener<JobEvent>>();

  constructor(private readonly deps: SupervisorDeps) {}

  getStatus(): EngineStatus {
    return this.status;
  }

  onStatus(listener: Listener<EngineStatus>): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onJobEvent(listener: Listener<JobEvent>): () => void {
    this.jobListeners.add(listener);
    return () => this.jobListeners.delete(listener);
  }

  /** Process id and port of the current engine run, for diagnostics (Settings → System). */
  processInfo(): { pid: number; port: number } | null {
    const pid = this.child?.pid;
    return pid !== undefined && this.status.state === "connected" ? { pid, port: this.port } : null;
  }

  /** Jobs that have reported progress and not yet finished. */
  runningJobs(): string[] {
    return [...this.running];
  }

  start(): void {
    this.stopping = false;
    this.failures = 0;
    this.everConnected = false;
    this.launch("starting");
  }

  /** User retry from the status bar after the engine became unavailable (GEN-222). */
  retry(): EngineStatus {
    if (this.status.state === "unavailable" || this.status.state === "stopped") this.start();
    return this.status;
  }

  async startJob(kind: string, params: Record<string, unknown> = {}): Promise<string> {
    const res = await this.request("/jobs", "POST", { kind, params });
    if (!res.ok) throw new Error(`engine refused job ${kind} (HTTP ${res.status})`);
    return JobStarted.parse(await res.json()).jobId;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const res = await this.request(`/jobs/${encodeURIComponent(jobId)}`, "DELETE");
    if (!res.ok) return false;
    const body = (await res.json()) as { cancelling?: unknown };
    return body.cancelling === true;
  }

  /** GEN-224: ask for a clean shutdown, then end the process tree after the grace period. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.clearTimers();
    const child = this.child;
    this.closeSocket();
    if (!child || child.exitCode !== null) {
      this.setStatus({ state: "stopped" });
      return;
    }
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      await this.request("/shutdown", "POST", undefined, AbortSignal.timeout(ENGINE_STOP_GRACE_MS));
    } catch {
      // Unreachable engine: closing stdin and the kill below still end it.
    }
    child.stdin?.end();
    let timer: unknown = null;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = this.deps.setTimeout(() => resolve("timeout"), ENGINE_STOP_GRACE_MS);
    });
    const result = await Promise.race([exited.then(() => "exited" as const), timedOut]);
    this.deps.clearTimeout(timer);
    if (result === "timeout" && child.pid !== undefined) {
      this.deps.log("engine did not exit within the grace period; ending its process tree");
      this.deps.killTree(child.pid);
    }
    this.setStatus({ state: "stopped" });
  }

  // ---------------------------------------------------------------------------

  private launch(state: "starting" | "restarting"): void {
    const cmd = this.deps.command();
    if ("error" in cmd) {
      this.setStatus({ state: "unavailable", reason: "not-installed", detail: cmd.error });
      return;
    }
    if (state === "starting") this.setStatus({ state: "starting" });
    const generation = ++this.generation;
    this.token = randomBytes(32).toString("hex");
    let child: ChildProcess;
    try {
      child = this.deps.spawn(cmd.file, cmd.args, {
        cwd: cmd.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
      });
    } catch (err) {
      this.onFailure(generation, `spawn failed: ${String(err)}`);
      return;
    }
    this.child = child;
    child.stdin?.write(`${this.token}\n`);

    let buffer = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith(READY_PREFIX)) void this.onReady(generation, line.slice(READY_PREFIX.length));
        else if (line) this.deps.log(`engine: ${line}`);
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) if (line.trim()) this.deps.log(`engine: ${line}`);
    });
    child.on("error", (err) => this.onFailure(generation, `process error: ${err.message}`));
    child.on("exit", (code, signal) => this.onFailure(generation, `exited with ${code ?? signal}`));
    this.readyTimer = this.deps.setTimeout(() => this.onFailure(generation, "no ready line within 30 s"), READY_TIMEOUT_MS);
  }

  private async onReady(generation: number, payload: string): Promise<void> {
    if (generation !== this.generation) return;
    this.deps.clearTimeout(this.readyTimer);
    try {
      const { port } = JSON.parse(payload) as { port: unknown };
      if (typeof port !== "number" || !Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("bad port");
      this.port = port;
      const res = await this.request("/health", "GET");
      const health = EngineHealth.parse(await res.json());
      if (generation !== this.generation) return;
      this.openEvents(generation);
      this.healthySince = this.deps.now();
      this.everConnected = true;
      this.setStatus({ state: "connected", version: health.version, location: "local" });
    } catch (err) {
      this.onFailure(generation, `health check failed: ${String(err)}`);
    }
  }

  private openEvents(generation: number): void {
    const socket = this.deps.openSocket(`ws://127.0.0.1:${this.port}/events`, [WS_PROTOCOL, this.token]);
    this.socket = socket;
    socket.onmessage = (ev) => {
      if (generation !== this.generation) return;
      const parsed = JobEvent.safeParse(typeof ev.data === "string" ? safeJson(ev.data) : null);
      if (!parsed.success) {
        this.deps.log("engine: ignored malformed job event");
        return;
      }
      const event = parsed.data;
      if (event.kind === "progress") this.running.add(event.jobId);
      else this.running.delete(event.jobId);
      for (const l of this.jobListeners) l(event);
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
    };
    socket.onerror = () => this.deps.log("engine: event socket error");
  }

  private onFailure(generation: number, detail: string): void {
    if (generation !== this.generation) return;
    this.generation++; // ignore further callbacks from this run
    this.clearTimers();
    this.closeSocket();
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.pid !== undefined) this.deps.killTree(child.pid);
    this.failRunningJobs();
    if (this.stopping) return;
    this.deps.log(`engine failure: ${detail}`);

    const wasConnected = this.status.state === "connected";
    if (wasConnected && this.deps.now() - this.healthySince >= ENGINE_HEALTHY_RESET_MS) this.failures = 0;
    if (this.failures >= ENGINE_RESTART_DELAYS_MS.length) {
      this.setStatus({ state: "unavailable", reason: this.everConnected ? "crashed-repeatedly" : "failed-to-start", detail });
      return;
    }
    const delay = ENGINE_RESTART_DELAYS_MS[this.failures] ?? ENGINE_RESTART_DELAYS_MS[4]; // index is always in range here
    this.failures++;
    this.setStatus({ state: "restarting", attempt: this.failures });
    this.restartTimer = this.deps.setTimeout(() => {
      this.restartTimer = null;
      this.launch("restarting");
    }, delay);
  }

  /** GEN-222: running jobs end as failed, never as done. */
  private failRunningJobs(): void {
    const ids = [...this.running];
    this.running.clear();
    for (const jobId of ids) for (const l of this.jobListeners) l({ kind: "error", jobId, message: ENGINE_STOPPED_MESSAGE });
  }

  private request(path: string, method: string, body?: unknown, signal?: AbortSignal) {
    const init: Parameters<SupervisorDeps["fetch"]>[1] = {
      method,
      headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    if (signal) init.signal = signal;
    return this.deps.fetch(`http://127.0.0.1:${this.port}${path}`, init);
  }

  private closeSocket(): void {
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onmessage = null;
      s.onclose = null;
      s.onerror = null;
      try {
        s.close();
      } catch {
        // already closed
      }
    }
  }

  private clearTimers(): void {
    if (this.restartTimer !== null) this.deps.clearTimeout(this.restartTimer);
    if (this.readyTimer !== null) this.deps.clearTimeout(this.readyTimer);
    this.restartTimer = null;
    this.readyTimer = null;
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
