import type { ViewerStack } from "@neuromr/contracts";
import { describe, expect, it } from "vitest";
import { flatten, layoutFor, scrollStep, sopAt } from "./stack.js";

const stack = (grid: (string | null)[][], axis: ViewerStack["axis"] = "dynamic"): ViewerStack => ({
  seriesInstanceUid: "1",
  studyInstanceUid: "2",
  description: "d",
  seriesNumber: 1,
  patientName: "P",
  patientId: "ID",
  studyDate: "",
  axis,
  slicePositions: grid.map((_, i) => i * 4),
  points: grid[0]?.map(() => ({})) ?? [],
  grid,
  images: [],
});

describe("GEN-230 viewer layout and stepping", () => {
  it("GEN-230 opens several series in the smallest layout that fits", () => {
    expect([1, 2, 3, 4, 5, 7, 12].map(layoutFor)).toEqual(["1x1", "1x2", "2x2", "2x2", "2x3", "3x3", "3x3"]);
  });

  it("GEN-021 a gap shows the nearest acquired point of the same slice", () => {
    const s = stack([["a", "b", "c"], ["d", null, "f"]]);
    expect(sopAt(s, 1, 1)).toBe("d");
    expect(sopAt(s, 1, 2)).toBe("f");
    expect(sopAt(s, 5, 0)).toBeNull();
    expect(flatten(s).ids).toEqual(["a", "b", "c", "d", "f"]);
  });

  it("GEN-020 one axis scrolls slices horizontally; GEN-021 two axes split the directions", () => {
    expect(scrollStep(stack([["a"], ["b"]], "none"), 1, 0)).toEqual({ dSlice: 1, dPoint: 0 });
    expect(scrollStep(stack([["a", "b"]]), 1, 0)).toEqual({ dSlice: 0, dPoint: 1 });
    expect(scrollStep(stack([["a", "b"]]), 0, -1)).toEqual({ dSlice: -1, dPoint: 0 });
  });
});
