import { describe, expect, it } from "vitest";
import { dragWindow, initialWindow } from "./window.js";

describe("GEN-232 initial window", () => {
  it("GEN-232 uses the recorded Window Center/Width", () => {
    expect(initialWindow([0, 1], 100, 50)).toEqual({ lower: 75, upper: 125 });
  });

  it("GEN-232 otherwise spans the 1st–99th percentile", () => {
    const v = Array.from({ length: 1001 }, (_, i) => i);
    v[1000] = 1e9; // one hot pixel does not stretch the window
    expect(initialWindow(v, null, null)).toEqual({ lower: 10, upper: 990 });
    expect(initialWindow([5, 5, 5], null, 0)).toEqual({ lower: 5, upper: 6 });
  });

  it("GEN-010 window drag widens with x and moves the level with y", () => {
    const r = dragWindow({ lower: 0, upper: 256 }, 10, 0);
    expect(r.upper - r.lower).toBeCloseTo(266);
    expect((r.upper + r.lower) / 2).toBeCloseTo(128);
    const l = dragWindow({ lower: 0, upper: 256 }, 0, -8);
    expect((l.upper + l.lower) / 2).toBeCloseTo(120);
  });
});
