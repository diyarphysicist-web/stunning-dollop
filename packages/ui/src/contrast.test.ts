import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.js";
import { SURFACE_TOKENS, TEXT_TOKENS, tokens } from "./tokens/tokens.js";

describe("brief §4.2 text contrast (exported design tokens)", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  for (const t of TEXT_TOKENS) {
    for (const s of SURFACE_TOKENS) {
      it(`${t} on ${s} is at least 4.5:1`, () => {
        expect(contrastRatio(tokens[t], tokens[s])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("semantic and accent colours used as text pass 4.5:1 on every surface", () => {
    for (const t of ["colorAccent", "colorSuccess", "colorWarning", "colorCritical"] as const) {
      for (const s of SURFACE_TOKENS) {
        expect(contrastRatio(tokens[t], tokens[s])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("text on the accent fill passes 4.5:1", () => {
    expect(contrastRatio(tokens.colorTextOnAccent, tokens.colorAccent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colorTextOnAccent, tokens.colorAccentHover)).toBeGreaterThanOrEqual(4.5);
  });

  it("tertiary on raised is 4.98:1 (4.977 exact) and the old #6B7380 fails", () => {
    expect(contrastRatio(tokens.colorTextTertiary, tokens.colorRaised)).toBeCloseTo(4.98, 2);
    expect(contrastRatio("#6B7380", tokens.colorRaised)).toBeLessThan(4.5);
  });

  it("print ink passes 4.5:1 on report paper (PDF reports)", () => {
    expect(contrastRatio(tokens.colorPrintInk, tokens.colorPrintPaper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colorPrintInkSecondary, tokens.colorPrintPaper)).toBeGreaterThanOrEqual(4.5);
  });

  it("brief §4.2 surface and text values are unchanged", () => {
    expect(tokens.colorViewport).toBe("#000000");
    expect([tokens.colorBg, tokens.colorSurface, tokens.colorRaised, tokens.colorBorder]).toEqual(["#0B0D10", "#12151A", "#181C22", "#232830"]);
    expect([tokens.colorTextPrimary, tokens.colorTextSecondary, tokens.colorTextTertiary]).toEqual(["#E6E9EE", "#9AA3AF", "#838B98"]);
    expect(tokens.colorAccent).toBe("#4DA3FF");
  });
});
