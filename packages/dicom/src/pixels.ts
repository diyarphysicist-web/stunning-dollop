import type { DataSet } from "dicom-parser";

/** An 8-bit greyscale image, row-major. */
export interface GreyImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const UNCOMPRESSED_LE = new Set(["1.2.840.10008.1.2", "1.2.840.10008.1.2.1"]);

/** Stored values of frame 0 of an uncompressed little-endian greyscale image, before any rescale. */
function readStored(ds: DataSet, transferSyntaxUid: string): { width: number; height: number; values: Float64Array; monochrome1: boolean } | undefined {
  if (!UNCOMPRESSED_LE.has(transferSyntaxUid)) return undefined;
  const el = ds.elements["x7fe00010"];
  const rows = ds.uint16("x00280010") ?? 0;
  const cols = ds.uint16("x00280011") ?? 0;
  const bits = ds.uint16("x00280100") ?? 16;
  const samples = ds.uint16("x00280002") ?? 1;
  const signed = (ds.uint16("x00280103") ?? 0) === 1;
  if (!el || el.encapsulatedPixelData || rows === 0 || cols === 0 || samples !== 1) return undefined;
  const photometric = (ds.string("x00280004") ?? "MONOCHROME2").trim();
  if (photometric !== "MONOCHROME1" && photometric !== "MONOCHROME2") return undefined;
  const n = rows * cols;
  const bytesPer = bits / 8;
  if (![1, 2, 4].includes(bytesPer) || el.length < n * bytesPer) return undefined;
  const view = new DataView(ds.byteArray.buffer, ds.byteArray.byteOffset + el.dataOffset, n * bytesPer);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (bytesPer === 1) values[i] = signed ? view.getInt8(i) : view.getUint8(i);
    else if (bytesPer === 2) values[i] = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
    else values[i] = signed ? view.getInt32(i * 4, true) : view.getUint32(i * 4, true);
  }
  return { width: cols, height: rows, values, monochrome1: photometric === "MONOCHROME1" };
}

/**
 * Reads frame 0 of a greyscale, uncompressed little-endian image as display brightness
 * (MONOCHROME1 negated). Returns undefined for compressed or colour data, which get no thumbnail
 * (DIR-002 shows a placeholder).
 */
export function readFrame(ds: DataSet, transferSyntaxUid: string): { width: number; height: number; values: Float64Array } | undefined {
  const f = readStored(ds, transferSyntaxUid);
  if (!f) return undefined;
  if (f.monochrome1) for (let i = 0; i < f.values.length; i++) f.values[i] = -(f.values[i] as number);
  return { width: f.width, height: f.height, values: f.values };
}

/** Modality values of an image for the viewer (GEN-232). */
export interface ModalityImage {
  width: number;
  height: number;
  /** Stored values with Rescale Slope and Intercept applied, row-major. */
  values: Float32Array<ArrayBuffer>;
  /** MONOCHROME1: low values are displayed bright. */
  invert: boolean;
}

/** Frame 0 with the modality rescale applied (GEN-232); undefined for compressed or colour data. */
export function readModalityImage(ds: DataSet, transferSyntaxUid: string): ModalityImage | undefined {
  const f = readStored(ds, transferSyntaxUid);
  if (!f) return undefined;
  const slope = ds.floatString("x00281053") ?? 1;
  const intercept = ds.floatString("x00281052") ?? 0;
  const values = new Float32Array(f.values.length);
  for (let i = 0; i < values.length; i++) values[i] = (f.values[i] as number) * slope + intercept;
  return { width: f.width, height: f.height, values, invert: f.monochrome1 };
}

function percentile(sorted: Float64Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] ?? 0;
}

/**
 * Thumbnail for the series list (DIR-002): box-averaged to fit `size` × `size` with the aspect
 * ratio kept, windowed from the 1st to the 99th percentile of the frame.
 */
export function thumbnail(ds: DataSet, transferSyntaxUid: string, size = 64): GreyImage | undefined {
  const frame = readFrame(ds, transferSyntaxUid);
  if (!frame) return undefined;
  const { width, height, values } = frame;
  const scale = Math.min(1, size / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const sorted = Float64Array.from(values).sort();
  const lo = percentile(sorted, 0.01);
  const hi = percentile(sorted, 0.99);
  const span = hi > lo ? hi - lo : 1;
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) sum += values[yy * width + xx] as number;
      const mean = sum / ((y1 - y0) * (x1 - x0));
      pixels[y * w + x] = Math.round(Math.min(1, Math.max(0, (mean - lo) / span)) * 255);
    }
  }
  return { width: w, height: h, pixels };
}
