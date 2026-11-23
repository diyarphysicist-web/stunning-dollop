import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { EngineCommand, EventSocket, SupervisorDeps } from "./supervisor.js";

export interface EngineLocation {
  /** True in an installed build: the engine is the frozen executable shipped in resources. */
  packaged: boolean;
  resourcesPath: string;
  /** apps/desktop in a development checkout. */
  appPath: string;
}

/**
 * Where the engine is. Installed builds run the frozen engine from resources (PyInstaller onedir,
 * Phase 2c); a development checkout runs `python -m neuromr_engine.api` from the repo's engine venv,
 * or from NEUROMR_ENGINE_PYTHON when set.
 */
export function resolveEngineCommand(loc: EngineLocation, env: NodeJS.ProcessEnv = process.env): EngineCommand {
  const exe = process.platform === "win32" ? "neuromr-engine.exe" : "neuromr-engine";
  if (loc.packaged) {
    const file = join(loc.resourcesPath, "engine", exe);
    return existsSync(file) ? { file, args: [], cwd: join(loc.resourcesPath, "engine") } : { error: `engine executable not found at ${file}` };
  }
  const engineDir = resolve(loc.appPath, "..", "..", "engine");
  const venvPython = process.platform === "win32" ? join(engineDir, ".venv", "Scripts", "python.exe") : join(engineDir, ".venv", "bin", "python");
  const python = env["NEUROMR_ENGINE_PYTHON"] || venvPython;
  if (!existsSync(python)) return { error: `Python for the engine not found at ${python}; run "uv sync" in engine/` };
  return { file: python, args: ["-m", "neuromr_engine.api"], cwd: engineDir };
}

/** Ends a process and its children (the Windows venv python.exe is a launcher with a child interpreter). */
export function killTree(pid: number): void {
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
  } catch {
    // already gone
  }
}

export function nodeDeps(command: () => EngineCommand, log: (line: string) => void): SupervisorDeps {
  return {
    command,
    spawn: (file, args, options) => spawn(file, args, options),
    fetch: (url, init) => fetch(url, init),
    openSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as EventSocket,
    killTree,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
    log,
  };
}
