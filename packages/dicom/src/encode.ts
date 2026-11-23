/**
 * Minimal Part 10 writer (explicit VR little endian) for building test files and fixtures.
 * Values: strings for text VRs (arrays are joined with backslash), numbers or number arrays for
 * binary VRs, Uint8Array for OB/OW, and arrays of element maps for SQ.
 */
export type ElementValue = string | number | readonly (string | number)[] | Uint8Array | readonly DicomElements[];
export interface DicomElement {
  vr: string;
  value: ElementValue;
}
export type DicomElements = Record<string, DicomElement>;

const LONG_VRS = new Set(["OB", "OW", "OF", "OD", "SQ", "UT", "UN", "UC", "UR"]);
const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function valueBytes(vr: string, value: ElementValue): Uint8Array {
  if (value instanceof Uint8Array) return value.length % 2 ? concat([value, new Uint8Array(1)]) : value;
  if (vr === "SQ") return concat((value as readonly DicomElements[]).map(item));
  const values = Array.isArray(value) ? value : [value];
  const binary: Record<string, [number, (v: DataView, n: number) => void]> = {
    US: [2, (v, n) => v.setUint16(0, n, true)],
    SS: [2, (v, n) => v.setInt16(0, n, true)],
    UL: [4, (v, n) => v.setUint32(0, n, true)],
    SL: [4, (v, n) => v.setInt32(0, n, true)],
    FL: [4, (v, n) => v.setFloat32(0, n, true)],
    FD: [8, (v, n) => v.setFloat64(0, n, true)],
  };
  const spec = binary[vr];
  if (spec) {
    const [size, write] = spec;
    return concat(values.map((n) => {
      const b = new Uint8Array(size);
      write(new DataView(b.buffer), Number(n));
      return b;
    }));
  }
  let text = values.map(String).join("\\");
  if (text.length % 2) text += vr === "UI" ? "\0" : " ";
  return vr === "PN" || vr === "LO" || vr === "SH" || vr === "LT" || vr === "ST" || vr === "UT" ? new TextEncoder().encode(text) : latin1(text);
}

function element(tag: string, { vr, value }: DicomElement): Uint8Array {
  let data = valueBytes(vr, value);
  if (data.length % 2) data = concat([data, new Uint8Array(1)]);
  const group = parseInt(tag.slice(0, 4), 16);
  const elem = parseInt(tag.slice(4, 8), 16);
  const long = LONG_VRS.has(vr);
  const head = new Uint8Array(long ? 12 : 8);
  const v = new DataView(head.buffer);
  v.setUint16(0, group, true);
  v.setUint16(2, elem, true);
  head.set(latin1(vr), 4);
  if (long) v.setUint32(8, data.length, true);
  else v.setUint16(6, data.length, true);
  return concat([head, data]);
}

function dataset(elements: DicomElements): Uint8Array {
  return concat(Object.keys(elements).sort().map((tag) => element(tag, elements[tag] as DicomElement)));
}

function item(elements: DicomElements): Uint8Array {
  const body = dataset(elements);
  const head = new Uint8Array(8);
  const v = new DataView(head.buffer);
  v.setUint16(0, 0xfffe, true);
  v.setUint16(2, 0xe000, true);
  v.setUint32(4, body.length, true);
  return concat([head, body]);
}

/** Writes a Part 10 file. Tags are 8 hex digits ("00100010"); meta (group 0002) is generated. */
export function encodeDicom(elements: DicomElements, opts: { part10?: boolean } = {}): Uint8Array {
  const sopClass = elements["00080016"]?.value as string | undefined;
  const sopInstance = elements["00080018"]?.value as string | undefined;
  const body = dataset(elements);
  if (opts.part10 === false) return body;
  const metaElements: DicomElements = {
    "00020001": { vr: "OB", value: Uint8Array.of(0, 1) },
    "00020010": { vr: "UI", value: "1.2.840.10008.1.2.1" },
  };
  if (sopClass) metaElements["00020002"] = { vr: "UI", value: sopClass };
  if (sopInstance) metaElements["00020003"] = { vr: "UI", value: sopInstance };
  const metaBody = dataset(metaElements);
  const groupLength = element("00020000", { vr: "UL", value: metaBody.length });
  return concat([new Uint8Array(128), latin1("DICM"), groupLength, metaBody, body]);
}
