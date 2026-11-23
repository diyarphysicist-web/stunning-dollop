import type { DataSet } from "dicom-parser";
import { decodeFrame, UndecodablePixels, type StoredFrame } from "./decode.js";

/** An 8-bit greyscale image, row-major. */
export interface GreyImage {
  width: number;
  height: number;
  pixels: Uint8Array;
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

/**
 * One frame with the modality rescale applied (GEN-232), in any supported transfer syntax
 * (GEN-238). Throws UndecodablePixels for colour data or a syntax without a codec.
 */
export async function readModalityImage(ds: DataSet, transferSyntaxUid: string, frame = 0): Promise<ModalityImage> {
  const f = await decodeFrame(ds, transferSyntaxUid, frame);
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
export async function thumbnail(ds: DataSet, transferSyntaxUid: string, size = 64, frame = 0): Promise<GreyImage | undefined> {
  try {
    return thumbnailOf(await decodeFrame(ds, transferSyntaxUid, frame), size);
  } catch (err) {
    // Colour or undecodable data gets no thumbnail (DIR-002 shows a placeholder).
    if (err instanceof UndecodablePixels) return undefined;
    throw err;
  }
}

/** Thumbnail of a decoded frame; MONOCHROME1 is shown with low values bright. */
export function thumbnailOf(frame: StoredFrame, size = 64): GreyImage {
  const { width, height } = frame;
  const values = frame.monochrome1 ? frame.values.map((v) => -v) : frame.values;
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
