import dicomParserNs, { type DataSet } from "dicom-parser";

/**
 * Pixel data decoding for every supported transfer syntax (GEN-238). Codecs are bundled JavaScript
 * builds loaded on first use, so decoding works offline. Callers run this off the interface thread.
 */
const dicomParser = ((dicomParserNs as unknown as { default?: typeof dicomParserNs }).default ?? dicomParserNs) as typeof dicomParserNs;

export const TS = {
  implicitLE: "1.2.840.10008.1.2",
  explicitLE: "1.2.840.10008.1.2.1",
  rle: "1.2.840.10008.1.2.5",
  jpegBaseline: "1.2.840.10008.1.2.4.50",
  jpegExtended: "1.2.840.10008.1.2.4.51",
  jpegLossless: "1.2.840.10008.1.2.4.57",
  jpegLosslessSv1: "1.2.840.10008.1.2.4.70",
  jpegLs: "1.2.840.10008.1.2.4.80",
  jpegLsNear: "1.2.840.10008.1.2.4.81",
  j2kLossless: "1.2.840.10008.1.2.4.90",
  j2k: "1.2.840.10008.1.2.4.91",
} as const;

const UNCOMPRESSED: ReadonlySet<string> = new Set([TS.implicitLE, TS.explicitLE]);
export const SUPPORTED_SYNTAXES: ReadonlySet<string> = new Set(Object.values(TS));
/** Syntaxes that are lossy by definition (GEN-239); …4.90 and RLE are always lossless. */
export const LOSSY_SYNTAXES: ReadonlySet<string> = new Set([TS.jpegBaseline, TS.jpegExtended, TS.jpegLsNear, TS.j2k]);

/** Stored values of one frame, before rescale. */
export interface StoredFrame {
  width: number;
  height: number;
  values: Float64Array;
  monochrome1: boolean;
}

/** Why a frame could not be decoded; the viewer shows a notice naming the syntax (GEN-234). */
export class UndecodablePixels extends Error {
  constructor(
    readonly reason: "syntax" | "colour" | "corrupt" | "missing",
    readonly transferSyntaxUid: string,
    detail: string = reason,
  ) {
    super(detail);
  }
}

interface PixelModule {
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  signed: boolean;
  frames: number;
  monochrome1: boolean;
}

function pixelModule(ds: DataSet, ts: string): PixelModule {
  const samples = ds.uint16("x00280002") ?? 1;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim();
  if (samples !== 1 || (photometric !== "MONOCHROME1" && photometric !== "MONOCHROME2")) throw new UndecodablePixels("colour", ts);
  const bitsAllocated = ds.uint16("x00280100") ?? 16;
  return {
    rows: ds.uint16("x00280010") ?? 0,
    columns: ds.uint16("x00280011") ?? 0,
    bitsAllocated,
    bitsStored: ds.uint16("x00280101") ?? bitsAllocated,
    signed: (ds.uint16("x00280103") ?? 0) === 1,
    frames: Math.max(1, Number.parseInt(ds.string("x00280008") ?? "1", 10) || 1),
    monochrome1: photometric === "MONOCHROME1",
  };
}

/** The compressed bytes of one frame of encapsulated pixel data. */
export function encapsulatedFrame(ds: DataSet, frame: number): Uint8Array {
  const el = ds.elements["x7fe00010"];
  if (!el?.encapsulatedPixelData || !el.fragments?.length) throw new UndecodablePixels("missing", "");
  const frames = Math.max(1, Number.parseInt(ds.string("x00280008") ?? "1", 10) || 1);
  if (frames === 1) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, 0, el.fragments.length);
  if (el.basicOffsetTable?.length) return dicomParser.readEncapsulatedImageFrame(ds, el, frame);
  if (el.fragments.length === frames) return dicomParser.readEncapsulatedPixelDataFromFragments(ds, el, frame, 1);
  // Several fragments per frame and no offset table: JPEG frames can be found by their markers.
  const table = dicomParser.createJPEGBasicOffsetTable(ds, el);
  return dicomParser.readEncapsulatedImageFrame(ds, el, frame, table);
}

/** PackBits decoding of one RLE segment into `out` (DICOM PS3.5 G.3.1). */
function unpackBits(src: Uint8Array, start: number, end: number, out: Uint8Array): void {
  let i = start;
  let o = 0;
  while (i < end && o < out.length) {
    const n = (src[i++] as number) << 24 >> 24;
    if (n >= 0) {
      for (let k = 0; k <= n && i < end && o < out.length; k++) out[o++] = src[i++] as number;
    } else if (n !== -128) {
      const v = src[i++] as number;
      for (let k = 0; k < 1 - n && o < out.length; k++) out[o++] = v;
    }
  }
}

/** RLE Lossless (PS3.5 Annex G): one segment per byte of the sample, most significant first. */
export function decodeRle(frame: Uint8Array, rows: number, columns: number, bitsAllocated: number): Uint8Array | Uint16Array | Uint32Array {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const segments = view.getUint32(0, true);
  const bytes = bitsAllocated / 8;
  if (segments !== bytes) throw new UndecodablePixels("corrupt", TS.rle, `RLE: ${segments} segments for ${bitsAllocated}-bit samples`);
  const n = rows * columns;
  const planes: Uint8Array[] = [];
  for (let s = 0; s < segments; s++) {
    const start = view.getUint32(4 + 4 * s, true);
    const end = s + 1 < segments ? view.getUint32(8 + 4 * s, true) : frame.byteLength;
    const plane = new Uint8Array(n);
    unpackBits(frame, start, end, plane);
    planes.push(plane);
  }
  const out = bytes === 1 ? new Uint8Array(n) : bytes === 2 ? new Uint16Array(n) : new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (const p of planes) v = v * 256 + (p[i] as number);
    out[i] = v;
  }
  return out;
}

interface EmscriptenDecoder {
  getEncodedBuffer(length: number): Uint8Array;
  getDecodedBuffer(): Uint8Array | Uint16Array;
  decode(): void;
  getFrameInfo(): { width: number; height: number; bitsPerSample: number; componentCount: number; isSigned?: boolean };
  delete?(): void;
}
type CodecModule = Record<string, new () => EmscriptenDecoder>;

const modules = new Map<string, Promise<CodecModule>>();
function codec(name: "jpeg8" | "jpeg12" | "jpegls" | "j2k"): Promise<CodecModule> {
  let m = modules.get(name);
  if (!m) {
    const load = async (): Promise<unknown> => {
      if (name === "jpeg8") return import("@cornerstonejs/codec-libjpeg-turbo-8bit/decode");
      if (name === "jpeg12") return import("@cornerstonejs/codec-libjpeg-turbo-12bit");
      if (name === "jpegls") return import("@cornerstonejs/codec-charls/decode");
      return import("@cornerstonejs/codec-openjpeg/decode");
    };
    m = load().then((ns) => {
      const factory = ((ns as { default?: unknown }).default ?? ns) as () => Promise<CodecModule>;
      return factory();
    });
    modules.set(name, m);
  }
  return m;
}

async function runEmscripten(name: "jpeg8" | "jpeg12" | "jpegls" | "j2k", cls: string, data: Uint8Array, ts: string): Promise<{ samples: Uint8Array; bits: number }> {
  const mod = await codec(name);
  const Decoder = mod[cls];
  if (!Decoder) throw new UndecodablePixels("syntax", ts, `codec ${name} has no ${cls}`);
  const d = new Decoder();
  try {
    d.getEncodedBuffer(data.length).set(data);
    d.decode();
    const info = d.getFrameInfo();
    if (info.componentCount !== 1) throw new UndecodablePixels("colour", ts);
    // Copy out of the codec's heap before the decoder is freed.
    const out = d.getDecodedBuffer();
    // The decoded buffer is 8- or 16-bit depending on the codec: copy its bytes, not its elements.
    return { samples: new Uint8Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)), bits: info.bitsPerSample };
  } catch (err) {
    if (err instanceof UndecodablePixels) throw err;
    // libjpeg reports bad data by calling exit(), which leaves the module unusable: load a fresh one next time.
    modules.delete(name);
    const message = typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : String(err);
    throw new UndecodablePixels("corrupt", ts, message);
  } finally {
    try {
      d.delete?.();
    } catch {
      /* the module may already have exited */
    }
  }
}

interface LosslessDecoder {
  decode(buffer?: ArrayBuffer, offset?: number, length?: number, numBytes?: number): Uint8Array | Uint16Array;
}
type LosslessModule = { Decoder?: new () => LosslessDecoder; default?: { Decoder?: new () => LosslessDecoder } };

async function decodeJpegLossless(data: Uint8Array, bitsAllocated: number, ts: string): Promise<Uint8Array | Uint16Array> {
  const ns = (await import("@cornerstonejs/jpeg-lossless-decoder-js")) as unknown as LosslessModule;
  const Decoder = ns.Decoder ?? ns.default?.Decoder;
  if (!Decoder) throw new UndecodablePixels("syntax", ts, "JPEG lossless decoder missing");
  try {
    // The decoder reads from offset 0 of the buffer it is given, so pass an exact copy.
    const own = new Uint8Array(data);
    return new Decoder().decode(own.buffer, 0, own.byteLength, bitsAllocated <= 8 ? 1 : 2);
  } catch (err) {
    throw new UndecodablePixels("corrupt", ts, err instanceof Error ? err.message : String(err));
  }
}

/** Reinterprets decoded bytes as samples of `bitsAllocated` (little-endian, as the codecs write them). */
function asSamples(bytes: Uint8Array, bitsAllocated: number): Uint8Array | Uint16Array {
  if (bitsAllocated <= 8) return bytes;
  const copy = bytes.byteOffset % 2 === 0 ? bytes : new Uint8Array(bytes);
  return new Uint16Array(copy.buffer, copy.byteOffset, copy.byteLength >> 1);
}

function toValues(samples: ArrayLike<number>, n: number, pm: PixelModule): Float64Array {
  const values = new Float64Array(n);
  const bits = pm.bitsStored;
  const mask = bits >= 32 ? 0xffffffff : 2 ** bits - 1;
  const sign = 2 ** (bits - 1);
  for (let i = 0; i < n; i++) {
    let v = (samples[i] as number) % (mask + 1);
    if (pm.signed && v >= sign) v -= 2 ** bits;
    values[i] = v;
  }
  return values;
}

function readUncompressed(ds: DataSet, pm: PixelModule, frame: number, ts: string): Float64Array {
  const el = ds.elements["x7fe00010"];
  if (!el) throw new UndecodablePixels("missing", ts);
  const n = pm.rows * pm.columns;
  const bytesPer = pm.bitsAllocated / 8;
  if (![1, 2, 4].includes(bytesPer)) throw new UndecodablePixels("syntax", ts, `${pm.bitsAllocated}-bit samples`);
  const offset = frame * n * bytesPer;
  if (el.length < offset + n * bytesPer) throw new UndecodablePixels("corrupt", ts, "pixel data shorter than its frames");
  const view = new DataView(ds.byteArray.buffer, ds.byteArray.byteOffset + el.dataOffset + offset, n * bytesPer);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (bytesPer === 1) values[i] = pm.signed ? view.getInt8(i) : view.getUint8(i);
    else if (bytesPer === 2) values[i] = pm.signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
    else values[i] = pm.signed ? view.getInt32(i * 4, true) : view.getUint32(i * 4, true);
  }
  return values;
}

/** Stored values of `frame` (0-based) in any supported transfer syntax (GEN-238). */
export async function decodeFrame(ds: DataSet, transferSyntaxUid: string, frame = 0): Promise<StoredFrame> {
  const ts = transferSyntaxUid;
  if (!SUPPORTED_SYNTAXES.has(ts)) throw new UndecodablePixels("syntax", ts);
  const pm = pixelModule(ds, ts);
  if (pm.rows === 0 || pm.columns === 0) throw new UndecodablePixels("missing", ts);
  if (frame < 0 || frame >= pm.frames) throw new UndecodablePixels("missing", ts, `frame ${frame} of ${pm.frames}`);
  const n = pm.rows * pm.columns;
  const done = (values: Float64Array): StoredFrame => ({ width: pm.columns, height: pm.rows, values, monochrome1: pm.monochrome1 });
  if (UNCOMPRESSED.has(ts)) return done(readUncompressed(ds, pm, frame, ts));

  const data = encapsulatedFrame(ds, frame);
  let samples: ArrayLike<number>;
  if (ts === TS.rle) samples = decodeRle(data, pm.rows, pm.columns, pm.bitsAllocated);
  else if (ts === TS.jpegLossless || ts === TS.jpegLosslessSv1) samples = await decodeJpegLossless(data, pm.bitsAllocated, ts);
  else {
    const [name, cls] =
      ts === TS.jpegBaseline || (ts === TS.jpegExtended && pm.bitsStored <= 8)
        ? (["jpeg8", "JPEGDecoder"] as const)
        : ts === TS.jpegExtended
          ? (["jpeg12", "JPEGDecoder"] as const)
          : ts === TS.jpegLs || ts === TS.jpegLsNear
            ? (["jpegls", "JpegLSDecoder"] as const)
            : (["j2k", "J2KDecoder"] as const);
    const out = await runEmscripten(name, cls, data, ts);
    samples = asSamples(out.samples, out.bits <= 8 ? 8 : 16);
  }
  if (samples.length < n) throw new UndecodablePixels("corrupt", ts, `decoded ${samples.length} of ${n} samples`);
  return done(toValues(samples, n, pm));
}
