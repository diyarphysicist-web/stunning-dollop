import { readHeaderDataSet } from "./parse.js";

/**
 * Files referenced by a DICOMDIR (DIR-001): each entry is the Referenced File ID path components,
 * relative to the folder holding the DICOMDIR. Returns undefined when the file is not a readable DICOMDIR.
 */
export function readDicomdir(bytes: Uint8Array): string[][] | undefined {
  const ds = readHeaderDataSet(bytes);
  if (!ds) return undefined;
  const seq = ds.elements["x00041220"];
  if (!seq) return undefined;
  const files: string[][] = [];
  for (const item of seq.items ?? []) {
    const id = item.dataSet?.string("x00041500");
    if (!id) continue;
    // CS values: components separated by backslash; dicom-parser's string() returns the first, so split the raw value.
    const el = item.dataSet?.elements["x00041500"];
    const raw = el && item.dataSet ? new TextDecoder("latin1").decode(item.dataSet.byteArray.subarray(el.dataOffset, el.dataOffset + el.length)) : id;
    const parts = raw.split("\\").map((p) => p.trim()).filter((p) => p.length > 0 && p !== ".");
    // A reference that climbs out of the media folder is never followed.
    if (parts.length > 0 && !parts.includes("..")) files.push(parts);
  }
  return files;
}
