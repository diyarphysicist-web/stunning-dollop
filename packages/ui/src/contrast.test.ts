import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";

// Brief §4.2 colour values. Phase 1 replaces these literals with the exported tokens.
const surfaces = { app: "#0B0D10", panel: "#12151A", raised: "#181C22" };
const text = { primary: "#E6E9EE", secondary: "#9AA3AF", tertiary: "#838B98" };

describe("brief §4.2 text contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  for (const [tName, t] of Object.entries(text)) {
    for (const [sName, s] of Object.entries(surfaces)) {
      it(`${tName} on ${sName} is at least 4.5:1`, () => {
        expect(contrastRatio(t, s)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("tertiary on raised is 4.98:1 (4.977 exact) and the old #6B7380 fails", () => {
    expect(contrastRatio(text.tertiary, surfaces.raised)).toBeCloseTo(4.98, 2);
    expect(contrastRatio("#6B7380", surfaces.raised)).toBeLessThan(4.5);
  });
});
