import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFrame, decodeRle, LOSSY_SYNTAXES, readHeader, TS, UndecodablePixels } from "./index.js";
import { fakeInstance } from "./testing.js";

function parse(bytes: Uint8Array) {
  const r = readHeader(bytes);
  if (r.status !== "ok") throw new Error("parse");
  return r;
}

describe("GEN-238 RLE Lossless", () => {
  it("GEN-238 decodes PackBits runs and literals into 16-bit samples, high byte first", () => {
    // 2 segments for 4 samples: high bytes [0,0,1,1] as a run; low bytes [5,6,7,8] as literals.
    const header = new Uint8Array(64);
    const view = new DataView(header.buffer);
    view.setUint32(0, 2, true);
    view.setUint32(4, 64, true);
    view.setUint32(8, 68, true);
    const seg1 = [0xff, 0, 0xff, 1]; // run of 2 × 0, run of 2 × 1
    const seg2 = [3, 5, 6, 7, 8]; // 4 literals
    const frame = new Uint8Array([...header, ...seg1, ...seg2]);
    expect([...decodeRle(frame, 2, 2, 16)]).toEqual([5, 6, 256 + 7, 256 + 8]);
  });
  it("GEN-238 rejects a segment count that does not match the sample size", () => {
    const header = new Uint8Array(64);
    new DataView(header.buffer).setUint32(0, 1, true);
    expect(() => decodeRle(header, 1, 1, 16)).toThrow(UndecodablePixels);
  });
});

describe("GEN-238 uncompressed and unsupported data", () => {
  it("GEN-238 reads Explicit VR Little Endian frames unchanged", async () => {
    const r = parse(fakeInstance({ sop: "8.1", pixels: Uint16Array.from({ length: 16 }, (_, i) => i * 100) }));
    const f = await decodeFrame(r.dataSet, r.header.transferSyntaxUid);
    expect([...f.values.slice(0, 3)]).toEqual([0, 100, 200]);
  });
  it("GEN-234 names a transfer syntax without a codec", async () => {
    const r = parse(fakeInstance({ sop: "8.2", pixels: new Uint16Array(16) }));
    await expect(decodeFrame(r.dataSet, "1.2.840.10008.1.2.4.100")).rejects.toMatchObject({ reason: "syntax", transferSyntaxUid: "1.2.840.10008.1.2.4.100" });
  });
});

// Codec phantoms (`pnpm phantoms`, or `--only codecs`). CI sets NEUROMR_REQUIRE_PHANTOMS so they cannot be skipped there.
const CODECS = resolve(import.meta.dirname, "../../../data/phantoms/codecs");
const required = process.env.NEUROMR_REQUIRE_PHANTOMS === "1";
const files = (dir: string) => readdirSync(join(CODECS, dir)).filter((f) => f.endsWith(".dcm")).sort().map((f) => readFileSync(join(CODECS, dir, f)));

describe.runIf(required || existsSync(CODECS))("GEN-238 codec phantoms decode to their reference", () => {
  const cases: [dir: string, ts: string, bits: 8 | 12 | 16][] = [
    ["rle", TS.rle, 16],
    ["jpeg-baseline", TS.jpegBaseline, 8],
    ["jpeg-extended", TS.jpegExtended, 12],
    ["jpeg-lossless", TS.jpegLossless, 16],
    ["jpeg-lossless-sv1", TS.jpegLosslessSv1, 16],
    ["jpeg-ls", TS.jpegLs, 16],
    ["jpeg-ls-near", TS.jpegLsNear, 16],
    ["j2k-lossless", TS.j2kLossless, 16],
    ["j2k", TS.j2k, 16],
  ];
  it.each(cases)("GEN-238 %s", async (dir, ts, bits) => {
    const got = files(dir);
    const want = files(`reference-${bits}`);
    expect(got).toHaveLength(3);
    for (let k = 0; k < got.length; k++) {
      const g = parse(got[k] as Uint8Array);
      const w = parse(want[k] as Uint8Array);
      expect(g.header.transferSyntaxUid).toBe(ts);
      const a = await decodeFrame(g.dataSet, ts);
      const b = await decodeFrame(w.dataSet, w.header.transferSyntaxUid);
      expect([a.width, a.height]).toEqual([b.width, b.height]);
      if (LOSSY_SYNTAXES.has(ts)) {
        let err = 0;
        for (let i = 0; i < a.values.length; i++) err += Math.abs((a.values[i] as number) - (b.values[i] as number));
        // Same bound as the engine test: mean error under 2 % of the stored range.
        expect(err / a.values.length).toBeLessThan(0.02 * (2 ** bits - 1));
      } else {
        expect(a.values).toEqual(b.values);
      }
    }
  });
});
