import { encodeDicom, type DicomElements } from "./encode.js";

export interface FakeInstance {
  study?: string;
  series?: string;
  sop: string;
  sopClass?: string;
  description?: string;
  te?: number;
  tr?: number;
  ti?: number;
  flip?: number;
  scanning?: string[];
  imageType?: string[];
  contrast?: string;
  temporal?: number;
  echo?: number;
  b?: number;
  grad?: [number, number, number];
  z?: number;
  rows?: number;
  cols?: number;
  frames?: number;
  pixels?: Uint16Array | false;
  extra?: DicomElements;
}

/** One MR instance with the attributes the classifier reads; 4 × 4 pixels unless set. */
export function fakeInstance(o: FakeInstance): Uint8Array {
  const rows = o.rows ?? 4;
  const cols = o.cols ?? 4;
  const el: DicomElements = {
    "00080005": { vr: "CS", value: "ISO_IR 192" },
    "00080008": { vr: "CS", value: o.imageType ?? ["ORIGINAL", "PRIMARY", "M", "NONE"] },
    "00080016": { vr: "UI", value: o.sopClass ?? "1.2.840.10008.5.1.4.1.1.4" },
    "00080018": { vr: "UI", value: o.sop },
    "00080020": { vr: "DA", value: "20260101" },
    "00080060": { vr: "CS", value: "MR" },
    "0008103E": { vr: "LO", value: o.description ?? "" },
    "00100010": { vr: "PN", value: "PHANTOM^SYNTHETIC" },
    "00100020": { vr: "LO", value: "NMR-PHANTOM-001" },
    "00180020": { vr: "CS", value: o.scanning ?? ["GR"] },
    "00180087": { vr: "DS", value: "3" },
    "0020000D": { vr: "UI", value: o.study ?? "1.2.3" },
    "0020000E": { vr: "UI", value: o.series ?? "1.2.3.4" },
    "00200011": { vr: "IS", value: "7" },
    "00200032": { vr: "DS", value: [0, 0, o.z ?? 0] },
    "00200037": { vr: "DS", value: [1, 0, 0, 0, 1, 0] },
    "00280002": { vr: "US", value: 1 },
    "00280004": { vr: "CS", value: "MONOCHROME2" },
    "00280010": { vr: "US", value: rows },
    "00280011": { vr: "US", value: cols },
    "00280030": { vr: "DS", value: [1, 1] },
    "00280100": { vr: "US", value: 16 },
    "00280101": { vr: "US", value: 16 },
    "00280102": { vr: "US", value: 15 },
    "00280103": { vr: "US", value: 0 },
    ...o.extra,
  };
  if (o.te !== undefined) el["00180081"] = { vr: "DS", value: o.te };
  if (o.tr !== undefined) el["00180080"] = { vr: "DS", value: o.tr };
  if (o.ti !== undefined) el["00180082"] = { vr: "DS", value: o.ti };
  if (o.flip !== undefined) el["00181314"] = { vr: "DS", value: o.flip };
  if (o.contrast) el["00180010"] = { vr: "LO", value: o.contrast };
  if (o.temporal !== undefined) el["00200100"] = { vr: "IS", value: o.temporal };
  if (o.echo !== undefined) el["00180086"] = { vr: "IS", value: o.echo };
  if (o.b !== undefined) el["00189087"] = { vr: "FD", value: o.b };
  if (o.grad) el["00189089"] = { vr: "FD", value: o.grad };
  if (o.frames !== undefined) el["00280008"] = { vr: "IS", value: o.frames };
  if (o.pixels !== false) {
    const px = o.pixels ?? Uint16Array.from({ length: rows * cols }, (_, i) => i * 100);
    el["7FE00010"] = { vr: "OW", value: new Uint8Array(px.buffer, px.byteOffset, px.byteLength) };
  }
  return encodeDicom(el);
}

export function fakeTrigger(ms: number): DicomElements {
  return { "00181060": { vr: "DS", value: ms } };
}
