import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeSeries, expandFrames, imageRef, parseImageRef, readHeader, readModalityImage, stackLayout, type InstanceHeader } from "./index.js";

describe("GEN-240 frame references", () => {
  it("GEN-240 single-frame images are named by their SOP UID, frames by UID:frame", () => {
    expect(imageRef({ sopInstanceUid: "1.2.3" })).toBe("1.2.3");
    expect(imageRef({ sopInstanceUid: "1.2.3", frame: 7 })).toBe("1.2.3:7");
    expect(parseImageRef("1.2.3:7")).toEqual({ sopInstanceUid: "1.2.3", frame: 7 });
    expect(parseImageRef("1.2.3")).toEqual({ sopInstanceUid: "1.2.3", frame: 0 });
  });
  it("GEN-240 a header without functional groups is not split", () => {
    const h = { sopInstanceUid: "1", numberOfFrames: 3 } as InstanceHeader;
    expect(expandFrames(h)).toEqual([h]);
  });
});

// Enhanced phantoms (`pnpm phantoms`, or `--only enhanced`). CI sets NEUROMR_REQUIRE_PHANTOMS so they cannot be skipped there.
const ROOT = resolve(import.meta.dirname, "../../../data/phantoms/enhanced");
const required = process.env.NEUROMR_REQUIRE_PHANTOMS === "1";

function load(dir: string) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".dcm"))
    .sort()
    .map((f) => {
      const r = readHeader(readFileSync(join(dir, f)));
      if (r.status !== "ok") throw new Error(`${f}: ${r.status}`);
      return r;
    });
}

describe.runIf(required || existsSync(ROOT))("GEN-240 enhanced multi-frame phantoms behave like their classic twins", () => {
  const axisOf = (f: ReturnType<typeof describeSeries>["facts"]) =>
    f.bValues.length > 1 || f.gradientDirections > 0 ? "volume" : f.echoes > 1 ? "echo" : f.dynamics > 1 ? "dynamic" : "none";

  it.each([
    ["dsc", ["DSC"], "dynamic"],
    ["dti", ["DTI"], "volume"],
    ["echo", [], "echo"],
  ] as const)("GEN-240 %s: same types, counts and stack layout", async (kind, types, axis) => {
    const classic = load(join(ROOT, kind, "classic"));
    const enhanced = load(join(ROOT, kind, "enhanced"));
    expect(enhanced).toHaveLength(1);
    const c = describeSeries(classic.map((r) => r.header));
    const e = describeSeries(enhanced.map((r) => r.header));
    // Classic phantoms define the expected classification; the enhanced copy must agree with it.
    if (types.length) expect(c.types).toEqual(expect.arrayContaining([...types]));
    expect(e.types).toEqual(c.types);
    // Enhanced MR names the echo type explicitly (EPI is SE or GR plus EP), so its scanning
    // sequence may add a value the classic phantom leaves out. The descriptions differ by design
    // ("classic" / "multi-frame"); everything else is identical.
    const { sopClassUid: _a, scanningSequence: cs, words: _c, ...cf } = c.facts;
    const { sopClassUid: _b, scanningSequence: es, words: _d, ...ef } = e.facts;
    void [_a, _b, _c, _d];
    expect(es).toEqual(expect.arrayContaining(cs));
    expect(ef).toEqual(cf);
    expect(axisOf(e.facts)).toBe(axis);

    const cl = stackLayout(classic.map((r) => r.header), axis);
    const el = stackLayout(enhanced.map((r) => r.header), axis);
    expect(el.slicePositions).toEqual(cl.slicePositions);
    expect(el.points).toEqual(cl.points);
    expect(el.grid.map((row) => row.length)).toEqual(cl.grid.map((row) => row.length));

    // Every cell decodes to the same modality values as the classic image at that cell.
    const bySop = new Map(classic.map((r) => [r.header.sopInstanceUid, r]));
    const enh = enhanced[0] as (typeof enhanced)[number];
    for (const [s, row] of el.grid.entries()) {
      for (const [p, ref] of row.entries()) {
        if (s % 2 || p % 3) continue; // a sample keeps the test quick
        const { frame } = parseImageRef(ref as string);
        const classicCell = bySop.get(cl.grid[s]?.[p] as string);
        if (!classicCell) throw new Error("classic cell missing");
        const a = await readModalityImage(enh.dataSet, enh.header.transferSyntaxUid, frame);
        const b = await readModalityImage(classicCell.dataSet, classicCell.header.transferSyntaxUid);
        expect(a.values).toEqual(b.values);
      }
    }
  });

  it("GEN-240 frames carry their own position, time and diffusion values", () => {
    const dti = load(join(ROOT, "dti", "enhanced"))[0]?.header;
    if (!dti) throw new Error("no enhanced DTI");
    const frames = expandFrames(dti);
    expect(frames.length).toBe(dti.numberOfFrames);
    expect(new Set(frames.map((f) => f.imagePosition?.[2])).size).toBeGreaterThan(1);
    expect(frames.some((f) => (f.bValue ?? 0) > 0 && f.gradient !== undefined)).toBe(true);
    const dsc = load(join(ROOT, "dsc", "enhanced"))[0]?.header;
    if (!dsc) throw new Error("no enhanced DSC");
    const times = expandFrames(dsc).map((f) => f.triggerTime);
    expect(times[0]).toBe(0);
    expect(Math.max(...(times as number[]))).toBeGreaterThan(0);
  });
});
