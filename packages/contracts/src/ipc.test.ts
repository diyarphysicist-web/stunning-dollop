import { describe, expect, it } from "vitest";
import { isIpcChannel, parseRequest, parseResponse } from "./ipc.js";

describe("IPC contract (brief §7: every IPC message validated with zod)", () => {
  it("knows only declared channels", () => {
    expect(isIpcChannel("app:info")).toBe(true);
    expect(isIpcChannel("fs:readAnything")).toBe(false);
    expect(isIpcChannel("toString")).toBe(false);
  });

  it("rejects unexpected request fields", () => {
    expect(parseRequest("app:info", {}).ok).toBe(true);
    expect(parseRequest("app:info", { path: "C:/" }).ok).toBe(false);
    expect(parseRequest("app:info", "x").ok).toBe(false);
  });

  it("accepts only known window actions", () => {
    expect(parseRequest("window:control", { action: "minimize" }).ok).toBe(true);
    expect(parseRequest("window:control", { action: "devtools" }).ok).toBe(false);
  });

  it("rejects malformed responses", () => {
    const good = { name: "NeuroMR-PRO", version: "0.1.0", platform: "win32", arch: "x64", electron: "45.4.1" };
    expect(parseResponse("app:info", good).ok).toBe(true);
    expect(parseResponse("app:info", { ...good, name: "Other" }).ok).toBe(false);
    expect(parseResponse("app:info", { ...good, platform: "android" }).ok).toBe(false);
  });
});
