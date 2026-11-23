import type { SeriesRow } from "@neuromr/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("../bridge.js", () => ({ invoke: vi.fn(async () => ({ ok: true, value: [] })) }));
vi.mock("@neuromr/viewer/cornerstone", () => ({ registerStack: vi.fn(), purge: vi.fn() }));

const { matchPreset } = await import("./presets.js");
const row = (uid: string, n: number | null, description: string, types: SeriesRow["types"]) => ({ seriesInstanceUid: uid, seriesNumber: n, description, types }) as SeriesRow;

describe("GEN-243 preset matching", () => {
  const series = [row("dsc-b", 9, "DSC perf b", ["DSC"]), row("dsc-a", 5, "DSC perf a", ["DSC"]), row("flair", 3, "FLAIR ax", ["FLAIR"]), row("loc", 1, "Localiser", [])];
  it("GEN-243 same type, preferring the same description, then the lowest series number; never twice", () => {
    expect(matchPreset([{ type: "DSC", description: "DSC perf b" }, { type: "DSC", description: "other" }, { type: "DSC", description: "x" }], series)).toEqual(["dsc-b", "dsc-a", null]);
    expect(matchPreset([{ type: "DSC", description: "anything" }], series)).toEqual(["dsc-a"]);
  });
  it("GEN-243 a cell without a type matches by description; empty cells stay empty", () => {
    expect(matchPreset([null, { type: null, description: "Localiser" }, { type: null, description: "Survey" }, { type: "FLAIR", description: "" }], series)).toEqual([null, "loc", null, "flair"]);
  });
});
