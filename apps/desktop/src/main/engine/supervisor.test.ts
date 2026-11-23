import type { EngineStatus, JobEvent } from "@neuromr/contracts";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type EngineCommand, type EventSocket, EngineSupervisor, READY_PREFIX, type SupervisorDeps } from "./supervisor.js";

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  written = "";
  constructor(public pid: number) {
    super();
    this.stdin.setEncoding("utf8");
    this.stdin.on("data", (d: string) => (this.written += d));
  }
  ready(port = 50123) {
    this.stdout.write(`${READY_PREFIX}${JSON.stringify({ port })}\n`);
  }
  exit(code = 1) {
    this.exitCode = code;
    this.emit("exit", code, null);
  }
}

class FakeSocket implements EventSocket {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string, public protocols: string[]) {}
  close() {
    this.closed = true;
  }
  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

function harness(command: EngineCommand = { file: "python", args: ["-m", "neuromr_engine.api"], cwd: "/engine" }) {
  const children: FakeChild[] = [];
  const sockets: FakeSocket[] = [];
  const spawns: { file: string; args: string[]; options: SpawnOptions }[] = [];
  const requests: { url: string; method: string; auth: string | undefined }[] = [];
  const killed: number[] = [];
  const statuses: EngineStatus[] = [];
  const jobEvents: JobEvent[] = [];
  let healthOk = true;
  const deps: SupervisorDeps = {
    command: () => command,
    spawn: (file, args, options) => {
      spawns.push({ file, args, options });
      const c = new FakeChild(1000 + children.length);
      children.push(c);
      return c as unknown as ChildProcess;
    },
    fetch: async (url, init) => {
      requests.push({ url, method: init.method ?? "GET", auth: init.headers["Authorization"] });
      if (url.endsWith("/health")) {
        return { ok: healthOk, status: healthOk ? 200 : 500, json: async () => (healthOk ? { status: "ok", version: "0.1.0", pid: 42 } : {}) };
      }
      if (url.endsWith("/shutdown")) return { ok: true, status: 202, json: async () => ({ stopping: true }) };
      if (url.endsWith("/jobs")) return { ok: true, status: 202, json: async () => ({ jobId: "job-1" }) };
      return { ok: true, status: 200, json: async () => ({ cancelling: true }) };
    },
    openSocket: (url, protocols) => {
      const s = new FakeSocket(url, protocols);
      sockets.push(s);
      return s;
    },
    killTree: (pid) => killed.push(pid),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    log: () => {},
  };
  const sup = new EngineSupervisor(deps);
  sup.onStatus((s) => statuses.push(s));
  sup.onJobEvent((e) => jobEvents.push(e));
  const last = () => children[children.length - 1] as FakeChild;
  const tokenOf = (c: FakeChild) => c.written.trim();
  return { sup, children, sockets, spawns, requests, killed, statuses, jobEvents, last, tokenOf, setHealth: (ok: boolean) => (healthOk = ok) };
}

async function connect(h: ReturnType<typeof harness>) {
  h.last().ready();
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("EngineSupervisor", () => {
  it("GEN-220: passes a fresh token on stdin only, then connects after a health check", async () => {
    const h = harness();
    h.sup.start();
    expect(h.sup.getStatus()).toEqual({ state: "starting" });
    const token = h.tokenOf(h.last());
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const spawn = h.spawns[0];
    expect(spawn?.args.join(" ")).not.toContain(token);
    expect(JSON.stringify(spawn?.options.env)).not.toContain(token);

    await connect(h);
    expect(h.sup.getStatus()).toEqual({ state: "connected", version: "0.1.0", location: "local" });
    expect(h.requests[0]).toEqual({ url: "http://127.0.0.1:50123/health", method: "GET", auth: `Bearer ${token}` });
    expect(h.sockets[0]?.url).toBe("ws://127.0.0.1:50123/events");
    expect(h.sockets[0]?.protocols).toEqual(["neuromr.v1", token]);
  });

  it("GEN-220: every start uses a new token", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    const first = h.tokenOf(h.last());
    h.last().exit(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.children).toHaveLength(2);
    expect(h.tokenOf(h.last())).not.toBe(first);
  });

  it("GEN-221: missing engine is reported as not installed", () => {
    const h = harness({ error: "Python for the engine not found" });
    h.sup.start();
    expect(h.sup.getStatus()).toMatchObject({ state: "unavailable", reason: "not-installed" });
    expect(h.spawns).toHaveLength(0);
  });

  it("GEN-222: restarts after 1, 2, 4, 8 and 16 s, then becomes unavailable", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (const [i, delay] of delays.entries()) {
      h.last().exit(1);
      expect(h.sup.getStatus()).toEqual({ state: "restarting", attempt: i + 1 });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.children).toHaveLength(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.children).toHaveLength(i + 2);
    }
    h.last().exit(1);
    expect(h.sup.getStatus()).toMatchObject({ state: "unavailable", reason: "crashed-repeatedly" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.children).toHaveLength(6);
  });

  it("GEN-222: an engine that never comes up is reported as failed to start; retry starts again", async () => {
    const h = harness();
    h.sup.start();
    for (let i = 0; i < 6; i++) {
      h.last().exit(1);
      await vi.advanceTimersByTimeAsync(16000);
    }
    expect(h.sup.getStatus()).toMatchObject({ state: "unavailable", reason: "failed-to-start" });
    expect(h.sup.retry()).toEqual({ state: "starting" });
    expect(h.children).toHaveLength(7);
  });

  it("GEN-222: a run that stays healthy for 60 s resets the restart count", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    for (let i = 0; i < 3; i++) {
      h.last().exit(1);
      await vi.advanceTimersByTimeAsync(16000);
      await connect(h);
    }
    await vi.advanceTimersByTimeAsync(60000);
    h.last().exit(1);
    expect(h.sup.getStatus()).toEqual({ state: "restarting", attempt: 1 });
  });

  it("GEN-222: a failed health check or missing ready line counts as a failure and ends the process", async () => {
    const h = harness();
    h.setHealth(false);
    h.sup.start();
    await connect(h);
    expect(h.sup.getStatus()).toEqual({ state: "restarting", attempt: 1 });
    expect(h.killed).toEqual([1000]);

    h.setHealth(true);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(30000); // no ready line
    expect(h.sup.getStatus()).toEqual({ state: "restarting", attempt: 2 });
    expect(h.killed).toEqual([1000, 1001]);
  });

  it("rejects a ready line with an invalid port", async () => {
    const h = harness();
    h.sup.start();
    h.last().stdout.write(`${READY_PREFIX}{"port": 99999}\n`);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.sup.getStatus()).toEqual({ state: "restarting", attempt: 1 });
    expect(h.requests).toHaveLength(0);
  });

  it("GEN-223: forwards validated job events and ignores malformed ones", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    const s = h.sockets[0] as FakeSocket;
    s.emit({ kind: "progress", jobId: "a", fraction: 0.5, stage: "fitting" });
    s.emit({ kind: "progress", jobId: "a", fraction: 7, stage: "bad" });
    s.emit({ kind: "done", jobId: "a" });
    expect(h.jobEvents).toEqual([
      { kind: "progress", jobId: "a", fraction: 0.5, stage: "fitting" },
      { kind: "done", jobId: "a" },
    ]);
    expect(h.sup.runningJobs()).toEqual([]);
    expect(await h.sup.startJob("slow", { steps: 3 })).toBe("job-1");
    expect(await h.sup.cancelJob("job-1")).toBe(true);
  });

  it("GEN-222: jobs running when the engine stops end as failed, never as done", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    (h.sockets[0] as FakeSocket).emit({ kind: "progress", jobId: "b", fraction: 0.2, stage: "fitting" });
    h.last().exit(1);
    expect(h.jobEvents.at(-1)).toEqual({ kind: "error", jobId: "b", message: "The engine stopped while this job was running." });
    expect(h.sup.runningJobs()).toEqual([]);
    expect((h.sockets[0] as FakeSocket).closed).toBe(true);
  });

  it("GEN-224: stop asks for shutdown and does not restart when the engine exits", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    const child = h.last();
    const stopping = h.sup.stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests.at(-1)?.url).toBe("http://127.0.0.1:50123/shutdown");
    child.exit(0);
    await stopping;
    expect(h.sup.getStatus()).toEqual({ state: "stopped" });
    expect(h.killed).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.children).toHaveLength(1);
  });

  it("GEN-224: stop ends the process tree when the engine ignores shutdown for 3 s", async () => {
    const h = harness();
    h.sup.start();
    await connect(h);
    const stopping = h.sup.stop();
    await vi.advanceTimersByTimeAsync(2999);
    expect(h.killed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await stopping;
    expect(h.killed).toEqual([1000]);
    expect(h.sup.getStatus()).toEqual({ state: "stopped" });
  });
});
