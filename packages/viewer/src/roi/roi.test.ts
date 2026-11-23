import { describe, expect, it } from "vitest";
import { anchors, containsPoint, ellipseFromClicks, moveAnchor, nextRoiName, outline, roiMask, roiStats, translateShape, uniqueRoiName, type RoiShape } from "./index.js";

const square = (x0: number, y0: number, x1: number, y1: number): RoiShape => ({ kind: "freehand", points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });

describe("GEN-236 voxel membership: centre inside the outline", () => {
  it("GEN-236 a square on pixel edges holds exactly its pixels", () => {
    const m = roiMask(square(2, 3, 5, 5), 10, 10);
    expect([...m]).toEqual([32, 33, 34, 42, 43, 44]);
  });

  it("GEN-236 a circle covers about πr² voxels and is clipped to the image", () => {
    const circle: RoiShape = { kind: "ellipse", center: [50, 50], a: 20, b: 20, angle: 0 };
    const n = roiMask(circle, 100, 100).length;
    expect(Math.abs(n - Math.PI * 400) / (Math.PI * 400)).toBeLessThan(0.02);
    const edge: RoiShape = { kind: "ellipse", center: [0, 0], a: 10, b: 10, angle: 0 };
    for (const i of roiMask(edge, 100, 100)) expect(i % 100).toBeLessThan(10);
  });

  it("GEN-236 a rotated ellipse keeps its area", () => {
    const flat: RoiShape = { kind: "ellipse", center: [50, 50], a: 30, b: 10, angle: 0 };
    const turned: RoiShape = { ...flat, angle: Math.PI / 5 };
    const a = roiMask(flat, 100, 100).length;
    const b = roiMask(turned, 100, 100).length;
    expect(Math.abs(a - b) / a).toBeLessThan(0.03);
  });

  it("GEN-030 a closed spline through a square's corners encloses its centre", () => {
    const s: RoiShape = { kind: "spline", points: [[10, 10], [30, 10], [30, 30], [10, 30]] };
    expect(outline(s).length).toBe(48);
    expect(containsPoint(s, [20, 20])).toBe(true);
    expect(containsPoint(s, [2, 2])).toBe(false);
    expect(roiMask(s, 40, 40).length).toBeGreaterThan(400);
  });
});

describe("GEN-236 statistics", () => {
  it("GEN-236 mean, sample SD, min, max and voxel count", () => {
    const values = Float32Array.from([1, 2, 3, 4, 100]);
    expect(roiStats(values, [0, 1, 2, 3])).toEqual({ voxels: 4, mean: 2.5, sd: Math.sqrt(5 / 3), min: 1, max: 4 });
    expect(roiStats(values, [4])).toEqual({ voxels: 1, mean: 100, sd: 0, min: 100, max: 100 });
    expect(roiStats(values, [])).toBeNull();
  });
});

describe("GEN-030 ellipse from three clicks", () => {
  it("GEN-030 width from the first two clicks, height from the third", () => {
    const e = ellipseFromClicks([10, 20], [30, 20], [20, 26]);
    expect(e).toEqual({ kind: "ellipse", center: [20, 20], a: 10, b: 6, angle: 0 });
    const tilted = ellipseFromClicks([0, 0], [10, 10], [0, 10]);
    if (tilted.kind !== "ellipse") throw new Error("kind");
    expect(tilted.angle).toBeCloseTo(Math.PI / 4);
    expect(tilted.b).toBeCloseTo(Math.SQRT2 * 5);
  });
});

describe("GEN-032 editing", () => {
  it("GEN-032 dragging an ellipse anchor resizes that axis only; translate moves everything", () => {
    const e: RoiShape = { kind: "ellipse", center: [20, 20], a: 10, b: 5, angle: 0 };
    expect(anchors(e)[0]).toEqual([30, 20]);
    expect(moveAnchor(e, 0, [35, 22])).toMatchObject({ a: 15, b: 5 });
    expect(moveAnchor(e, 1, [20, 28])).toMatchObject({ a: 10, b: 8 });
    expect(translateShape(e, 2, -1)).toMatchObject({ center: [22, 19] });
  });

  it("GEN-032 a spline anchor is its control point", () => {
    const s: RoiShape = { kind: "spline", points: [[0, 0], [10, 0], [10, 10]] };
    expect(moveAnchor(s, 1, [12, 1])).toEqual({ kind: "spline", points: [[0, 0], [12, 1], [10, 10]] });
  });

  it("GEN-032 a freehand anchor drags its neighbours with a fall-off", () => {
    const pts = Array.from({ length: 32 }, (_, i) => [i, 0] as const);
    const moved = moveAnchor({ kind: "freehand", points: pts }, 1, [2, 10]);
    if (moved.kind !== "freehand") throw new Error("kind");
    expect(moved.points[2]).toEqual([2, 10]);
    expect(moved.points[3]?.[1]).toBeCloseTo(5);
    expect(moved.points[10]).toEqual([10, 0]);
  });
});

describe("GEN-033 names", () => {
  it("GEN-033 defaults count on from the highest ROIn", () => {
    expect(nextRoiName([])).toBe("ROI1");
    expect(nextRoiName(["ROI1", "Hemisphere", "ROI4"])).toBe("ROI5");
  });
  it("GEN-033 duplicate user names get a numeric suffix", () => {
    expect(uniqueRoiName("Hemisphere", ["Hemisphere"])).toBe("Hemisphere 2");
    expect(uniqueRoiName("Hemisphere", ["Hemisphere", "Hemisphere 2"])).toBe("Hemisphere 3");
    expect(uniqueRoiName(" Lesion ", [])).toBe("Lesion");
  });
});
