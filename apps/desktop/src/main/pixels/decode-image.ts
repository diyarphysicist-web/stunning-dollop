import { readFile } from "node:fs/promises";
import { readHeader, readModalityImage, thumbnail, UndecodablePixels } from "@neuromr/dicom";
import { encodePng } from "../directory/png.js";

/** Result of decoding one stored frame for the viewer (GEN-232, GEN-234, GEN-238). */
export type DecodedImage =
  | { status: "ok"; width: number; height: number; values: Float32Array<ArrayBuffer>; invert: boolean }
  | { status: "unsupported"; transferSyntaxUid: string }
  | { status: "missing" };

export type DecodeImage = (path: string, frame: number) => Promise<DecodedImage>;

/** Reads and decodes one frame of a stored file. Runs in the pixel worker (GEN-238). */
export async function decodeImage(path: string, frame: number): Promise<DecodedImage> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    return { status: "missing" };
  }
  const parsed = readHeader(bytes);
  if (parsed.status !== "ok") return { status: "missing" };
  try {
    const img = await readModalityImage(parsed.dataSet, parsed.header.transferSyntaxUid, frame);
    return { status: "ok", ...img };
  } catch (err) {
    if (err instanceof UndecodablePixels) return { status: "unsupported", transferSyntaxUid: parsed.header.transferSyntaxUid };
    throw err;
  }
}

/** PNG thumbnail of a stored file (DIR-002); null when it cannot be decoded. */
export async function thumbnailPng(path: string): Promise<Buffer | null> {
  try {
    const parsed = readHeader(await readFile(path));
    const img = parsed.status === "ok" ? await thumbnail(parsed.dataSet, parsed.header.transferSyntaxUid) : undefined;
    return img ? encodePng(img) : null;
  } catch {
    return null; // A thumbnail is a convenience; the series stays usable without one.
  }
}
