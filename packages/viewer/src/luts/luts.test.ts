import { describe, expect, it } from "vitest";
import { buildLut, LUT_NAMES, ROI_PALETTE, roiColor } from "./index.js";

describe("GEN-140 colour LUTs", () => {
  it("every LUT has 256 entries starting and ending at its control points", () => {
    for (const name of LUT_NAMES) {
      const lut = buildLut(name);
      expect(lut).toHaveLength(256);
      for (const rgb of lut) for (const c of rgb) expect(c).toBeGreaterThanOrEqual(0);
    }
    expect(buildLut("gray")[0]).toEqual([0, 0, 0]);
    expect(buildLut("gray")[255]).toEqual([255, 255, 255]);
    expect(buildLut("stroke")[0]).toEqual([0, 0, 0]);
    expect(buildLut("stroke")[255]).toEqual([255, 0, 0]);
  });

  it("gray is monotonic", () => {
    const g = buildLut("gray").map((v) => v[0]);
    expect(g).toEqual([...g].sort((a, b) => a - b));
  });
});

describe("GEN-035 ROI palette", () => {
  it("has 8 distinct colours and wraps in order", () => {
    expect(new Set(ROI_PALETTE).size).toBe(8);
    expect(roiColor(0)).toBe(ROI_PALETTE[0]);
    expect(roiColor(8)).toBe(ROI_PALETTE[0]);
  });
});
