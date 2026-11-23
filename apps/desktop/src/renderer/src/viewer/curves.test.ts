import type { ViewerStack } from "@neuromr/contracts";
import { describe, expect, it } from "vitest";
import { averageCurve, curvesTsv, curveX, hasTimes, roiTableTsv } from "./curves.js";

const stack = (axis: ViewerStack["axis"], times: (number | undefined)[]) =>
  ({ axis, points: times.map((timeS) => (timeS === undefined ? {} : { timeS })), grid: [times.map((_, k) => `r${k}`)] }) as unknown as ViewerStack;

describe("GEN-245 curve axes", () => {
  it("GEN-245 seconds from the first dynamic when every point has a time, else the point number", () => {
    const s = stack("dynamic", [12, 13.5, 15]);
    expect(hasTimes(s)).toBe(true);
    expect(curveX(s, "time")).toEqual({ values: [0, 1.5, 3], label: "Time [s]" });
    expect(curveX(s, "index")).toEqual({ values: [1, 2, 3], label: "Dynamic" });
    const echo = stack("echo", [undefined, undefined]);
    expect(hasTimes(echo)).toBe(false);
    expect(curveX(echo, "time")).toEqual({ values: [1, 2], label: "Echo" });
  });
  it("GEN-245 the average skips gaps", () => {
    expect(averageCurve([[1, null, 3], [3, 4, null]])).toEqual([2, 4, 3]);
    expect(averageCurve([[null], [null]])).toEqual([null]);
  });
});

describe("GEN-246 copy as tab-separated text", () => {
  it("GEN-246 curves: header with names and units, one row per point, machine numbers, gaps empty", () => {
    const text = curvesTsv({ values: [0, 1.5], label: "Time [s]" }, [{ name: "ROI1", values: [1234.5, null] }, { name: "Lesion", values: [2, 3] }], "a.u.");
    expect(text).toBe("Time [s]\tROI1 [a.u.]\tLesion [a.u.]\r\n0\t1234.5\t2\r\n1.5\t\t3\r\n");
  });
  it("GEN-246 ROI table: one row per ROI with units in the header", () => {
    const text = roiTableTsv([{ name: "ROI1", stats: { mean: 10, sd: 1.5, min: 8, max: 12, voxels: 4 } }, { name: "ROI2", stats: null }], "a.u.", 4);
    expect(text.split("\r\n")).toEqual(["ROI\tMean [a.u.]\tSD [a.u.]\tMin [a.u.]\tMax [a.u.]\tVoxels\tArea [mm²]", "ROI1\t10\t1.5\t8\t12\t4\t16", "ROI2\t\t\t\t\t\t", ""]);
  });
});
