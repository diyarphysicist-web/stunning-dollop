import { describe, expect, it } from "vitest";
import { readHeader, readModalityImage, stackLayout, type InstanceHeader } from "./index.js";
import { fakeInstance, fakeTrigger, type FakeInstance } from "./testing.js";

const h = (o: FakeInstance): InstanceHeader => {
  const r = readHeader(fakeInstance(o));
  if (r.status !== "ok") throw new Error("parse");
  return r.header;
};

describe("GEN-021 slices × second image axis", () => {
  it("GEN-021 orders a dynamic series by slice position and time, in any file order", () => {
    const list: InstanceHeader[] = [];
    for (const k of [2, 0, 1]) for (const z of [8, 0, 4]) list.push(h({ sop: `1.${k}.${z}`, z, temporal: k + 1, extra: fakeTrigger(1000 + k * 1500) }));
    const s = stackLayout(list, "dynamic");
    expect(s.slicePositions).toEqual([0, 4, 8]);
    expect(s.grid[0]).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
    expect(s.grid[2]?.[1]).toBe("1.1.8");
    expect(s.points.map((p) => p.timeS)).toEqual([0, 1.5, 3]);
  });

  it("GEN-021 diffusion volumes keep acquisition order and their b-values", () => {
    const list = [0, 1000, 1000].map((b, i) => h({ sop: `2.${i}`, b, extra: { "00200012": { vr: "IS", value: i + 1 } } }));
    const s = stackLayout(list, "volume");
    expect(s.grid).toEqual([["2.0", "2.1", "2.2"]]);
    expect(s.points.map((p) => p.bValue)).toEqual([0, 1000, 1000]);
  });

  it("GEN-021 echoes are ordered by echo number", () => {
    const list = [3, 1, 2].map((e) => h({ sop: `3.${e}`, echo: e, te: e * 5 }));
    const s = stackLayout(list, "echo");
    expect(s.grid).toEqual([["3.1", "3.2", "3.3"]]);
    expect(s.points.map((p) => p.echoTimeMs)).toEqual([5, 10, 15]);
  });

  it("GEN-020 a single-attribute series has one point per slice; a missing image is a gap", () => {
    expect(stackLayout([h({ sop: "4.1", z: 4 }), h({ sop: "4.0", z: 0 })], "none").grid).toEqual([["4.0"], ["4.1"]]);
    const gap = stackLayout([h({ sop: "5.0", z: 0, temporal: 1 }), h({ sop: "5.1", z: 0, temporal: 2 }), h({ sop: "5.2", z: 4, temporal: 1 })], "dynamic");
    expect(gap.grid[1]).toEqual(["5.2", null]);
  });
});

describe("GEN-232 modality values", () => {
  it("GEN-232 applies Rescale Slope and Intercept and records the window", () => {
    const r = readHeader(
      fakeInstance({ sop: "9.1", pixels: Uint16Array.from([0, 10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40]), extra: { "00281053": { vr: "DS", value: 0.5 }, "00281052": { vr: "DS", value: -2 }, "00281050": { vr: "DS", value: 7 }, "00281051": { vr: "DS", value: 9 } } }),
    );
    if (r.status !== "ok") throw new Error("parse");
    const img = readModalityImage(r.dataSet, r.header.transferSyntaxUid);
    expect(img?.width).toBe(4);
    expect([...(img?.values.slice(0, 4) ?? [])]).toEqual([-2, 3, 8, 13]);
    expect(img?.values[15]).toBe(18);
    expect(img?.invert).toBe(false);
    expect([r.header.windowCenter, r.header.windowWidth]).toEqual([7, 9]);
  });
});
