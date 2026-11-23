import { describe, expect, it } from "vitest";
import { imageToWorld, worldToImage } from "./geometry.js";

describe("GEN-236 image ↔ patient coordinates", () => {
  it("GEN-236 the first pixel's centre is Image Position Patient", () => {
    const plane = { orientation: [1, 0, 0, 0, 1, 0], position: [-47, -47, 4] as const, pixelSpacing: [2, 2] as const };
    expect(imageToWorld(plane, [0.5, 0.5])).toEqual([-47, -47, 4]);
    expect(imageToWorld(plane, [10.5, 0.5])).toEqual([-27, -47, 4]);
  });

  it("GEN-236 round trip on an oblique plane with anisotropic pixels", () => {
    const s = Math.SQRT1_2;
    const plane = { orientation: [s, s, 0, 0, 0, -1], position: [10, 20, 30] as const, pixelSpacing: [3, 1.5] as const };
    const w = imageToWorld(plane, [12.25, 7.75]);
    const back = worldToImage(plane, w);
    expect(back[0]).toBeCloseTo(12.25);
    expect(back[1]).toBeCloseTo(7.75);
  });
});
