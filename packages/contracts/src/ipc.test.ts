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

  it("validates engine status (GEN-221)", () => {
    expect(parseResponse("engine:status", { state: "connected", version: "0.1.0", location: "local" }).ok).toBe(true);
    expect(parseResponse("engine:status", { state: "restarting", attempt: 3 }).ok).toBe(true);
    expect(parseResponse("engine:status", { state: "restarting", attempt: 6 }).ok).toBe(false);
    expect(parseResponse("engine:status", { state: "unavailable", reason: "oops", detail: "" }).ok).toBe(false);
    expect(parseRequest("engine:retry", {}).ok).toBe(true);
  });

  it("DIR-001 import requests carry no path: main opens its own dialog", () => {
    expect(parseRequest("directory:import", { source: "folder" }).ok).toBe(true);
    expect(parseRequest("directory:import", { source: "folder", path: "C:/Windows" }).ok).toBe(false);
    expect(parseRequest("directory:import", { source: "pacs" }).ok).toBe(false);
  });

  it("DIR-009 study search defaults to empty and is bounded", () => {
    const r = parseRequest("directory:studies", {});
    expect(r.ok && r.value.search).toBe("");
    expect(parseRequest("directory:studies", { search: "x".repeat(201) }).ok).toBe(false);
  });

  it("DIR-002 series thumbnails are PNG data URLs only", () => {
    const row = { seriesInstanceUid: "1.2", studyInstanceUid: "1", patientId: "P", description: "d", types: ["DSC"], dynamics: 40, echoes: 1, bValues: [], gradientDirections: 0, isDynamic: true, hasGeometry: true, preprocessingDone: true, seriesNumber: 150, status: "ready", imageCount: 160, slices: 4, rows: 64, columns: 64, thumbnail: "data:image/png;base64,AAAA" };
    expect(parseResponse("directory:series", [row]).ok).toBe(true);
    expect(parseResponse("directory:series", [{ ...row, thumbnail: "https://example.org/x.png" }]).ok).toBe(false);
  });

  it("rejects malformed responses", () => {
    const good = { name: "NeuroMR-PRO", version: "0.1.0", platform: "win32", arch: "x64", electron: "45.4.1" };
    expect(parseResponse("app:info", good).ok).toBe(true);
    expect(parseResponse("app:info", { ...good, name: "Other" }).ok).toBe(false);
    expect(parseResponse("app:info", { ...good, platform: "android" }).ok).toBe(false);
  });

  it("GEN-234 the viewer asks for images by UID only and gets typed modality values back", () => {
    expect(parseRequest("viewer:pixels", { sopInstanceUid: "1.2.3" }).ok).toBe(true);
    expect(parseRequest("viewer:pixels", { sopInstanceUid: "1.2.3", path: "C:/store/x.dcm" }).ok).toBe(false);
    expect(parseRequest("viewer:stack", { seriesInstanceUid: "" }).ok).toBe(false);
    const px = { status: "ok", sopInstanceUid: "1.2.3", width: 2, height: 2, values: new Float32Array(4), invert: false };
    expect(parseResponse("viewer:pixels", px).ok).toBe(true);
    expect(parseResponse("viewer:pixels", { ...px, values: [0, 0, 0, 0] }).ok).toBe(false);
  });

  it("GEN-233 inspector rows carry a DICOM tag and an optional known unit", () => {
    expect(parseResponse("viewer:attributes", [{ tag: "(0018,0080)", keyword: "RepetitionTime", value: 1500, unit: "ms" }]).ok).toBe(true);
    expect(parseResponse("viewer:attributes", [{ tag: "0018,0080", keyword: "RepetitionTime", value: 1500 }]).ok).toBe(false);
    expect(parseResponse("viewer:attributes", [{ tag: "(0018,0080)", keyword: "RepetitionTime", value: 1500, unit: "furlong" }]).ok).toBe(false);
  });
});
