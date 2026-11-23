import * as dicomParserNs from "dicom-parser";
import type { DataSet } from "dicom-parser";

// dicom-parser ships a UMD bundle; under Node ESM its API sits on `default`.
const dicomParser: typeof dicomParserNs = (dicomParserNs as unknown as { default?: typeof dicomParserNs }).default ?? dicomParserNs;

/** True when the bytes carry the Part 10 preamble and "DICM" magic. */
export function hasPart10Magic(bytes: Uint8Array): boolean {
  return bytes.length >= 132 && bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d;
}

/**
 * Parses a DICOM file. Files without a Part 10 preamble are read as implicit VR little endian
 * (older archives). Returns the data set, or the parser's error text.
 */
export function parseBytes(bytes: Uint8Array): DataSet | string {
  try {
    return hasPart10Magic(bytes) ? dicomParser.parseDicom(bytes) : dicomParser.parseDicom(bytes, { TransferSyntaxUID: "1.2.840.10008.1.2" });
  } catch (err) {
    return typeof err === "string" ? err : err instanceof Error ? err.message : "parse error";
  }
}

export function readHeaderDataSet(bytes: Uint8Array): DataSet | undefined {
  const ds = parseBytes(bytes);
  return typeof ds === "string" ? undefined : ds;
}
