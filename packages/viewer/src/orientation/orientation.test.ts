import { describe, expect, it } from "vitest";
import { IDENTITY, directionLabel, markersFromScreenAxes, screenAxes } from "./index.js";

const AXIAL = [1, 0, 0, 0, 1, 0];
const SAGITTAL = [0, 1, 0, 0, 0, -1];
const CORONAL = [1, 0, 0, 0, 0, -1];
const m = (iop: number[], t = IDENTITY) => {
  const a = screenAxes(iop, t);
  return markersFromScreenAxes(a.right, a.down);
};

describe("SAFE-040 orientation markers", () => {
  it("SAFE-040 standard planes in radiological display", () => {
    expect(m(AXIAL)).toEqual({ top: "A", bottom: "P", left: "R", right: "L" });
    expect(m(SAGITTAL)).toEqual({ top: "S", bottom: "I", left: "A", right: "P" });
    expect(m(CORONAL)).toEqual({ top: "S", bottom: "I", left: "R", right: "L" });
  });

  it("SAFE-040 oblique directions name both axes, strongest first", () => {
    expect(directionLabel([0.8, -0.6, 0])).toBe("LA");
    expect(directionLabel([0.98, 0.1, 0.17])).toBe("L");
  });

  it("GEN-130 mirror, flip and rotation update the markers", () => {
    expect(m(AXIAL, { mirror: true, flip: false, quarterTurns: 0 })).toEqual({ top: "A", bottom: "P", left: "L", right: "R" });
    expect(m(AXIAL, { mirror: false, flip: true, quarterTurns: 0 })).toEqual({ top: "P", bottom: "A", left: "R", right: "L" });
    expect(m(AXIAL, { mirror: false, flip: false, quarterTurns: 1 })).toEqual({ top: "R", right: "A", bottom: "L", left: "P" });
    expect(m(AXIAL, { mirror: false, flip: false, quarterTurns: -1 })).toEqual(m(AXIAL, { mirror: false, flip: false, quarterTurns: 3 }));
    expect(m(AXIAL, { mirror: false, flip: false, quarterTurns: 4 })).toEqual(m(AXIAL));
  });
});
