import type { EngineStatus } from "@neuromr/contracts";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { killTree, nodeDeps, resolveEngineCommand } from "./runtime.js";
import { EngineSupervisor } from "./supervisor.js";

// Runs the supervisor against the real Python engine (engine/.venv). Locally it is skipped when the
// venv is missing; in CI the engine must be installed, so a missing venv fails the run.
const appPath = resolve(import.meta.dirname, "..", "..", "..");
const command = resolveEngineCommand({ packaged: false, resourcesPath: "", appPath });
const available = !("error" in command);
if (!available && process.env["CI"]) throw new Error(`engine not installed in CI: ${"error" in command ? command.error : ""}`);

function waitFor(sup: EngineSupervisor, pred: (s: EngineStatus) => boolean, ms = 30000): Promise<EngineStatus> {
  return new Promise((res, rej) => {
    if (pred(sup.getStatus())) return res(sup.getStatus());
    const timer = setTimeout(() => rej(new Error(`timed out in state ${JSON.stringify(sup.getStatus())}`)), ms);
    const off = sup.onStatus((s) => {
      if (pred(s)) {
        clearTimeout(timer);
        off();
        res(s);
      }
    });
  });
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe.skipIf(!available)("EngineSupervisor with the real engine", () => {
  let sup: EngineSupervisor | null = null;
  afterEach(async () => {
    await sup?.stop();
    sup = null;
  });

  it("GEN-220/221: starts the engine and connects", async () => {
    sup = new EngineSupervisor(nodeDeps(() => command, () => {}));
    sup.start();
    const status = await waitFor(sup, (s) => s.state === "connected");
    expect(status).toEqual({ state: "connected", version: "0.1.0", location: "local" });
    await expect(sup.startJob("no-such-kind")).rejects.toThrow(/HTTP 404/);
  }, 60000);

  it("GEN-222: restarts after the engine is killed", async () => {
    sup = new EngineSupervisor(nodeDeps(() => command, () => {}));
    sup.start();
    await waitFor(sup, (s) => s.state === "connected");
    const first = sup.processInfo();
    expect(first).not.toBeNull();
    killTree(first?.pid ?? 0);
    await waitFor(sup, (s) => s.state === "restarting");
    await waitFor(sup, (s) => s.state === "connected");
    expect(sup.processInfo()?.port).not.toBe(first?.port);
  }, 60000);

  it("GEN-224: stop leaves no engine process behind", async () => {
    sup = new EngineSupervisor(nodeDeps(() => command, () => {}));
    sup.start();
    await waitFor(sup, (s) => s.state === "connected");
    const pid = sup.processInfo()?.pid ?? 0;
    await sup.stop();
    expect(sup.getStatus()).toEqual({ state: "stopped" });
    const deadline = Date.now() + 5000;
    while (alive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    expect(alive(pid)).toBe(false);
  }, 60000);
});
