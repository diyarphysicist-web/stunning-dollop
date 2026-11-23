import type { DataSet, Element } from "dicom-parser";
import { hasPart10Magic, parseBytes } from "./parse.js";

/** Why an input file was not indexed (DIR-006). `missing-file` is used by DICOMDIR import. */
export type QuarantineReasonCode = "not-dicom" | "unreadable" | "missing-uid" | "no-pixel-data" | "missing-file";

/** The header attributes the index, the classifier (ALGORITHMS.md §13) and the Directory need. */
export interface InstanceHeader {
  sopInstanceUid: string;
  sopClassUid: string;
  transferSyntaxUid: string;
  studyInstanceUid: string;
  seriesInstanceUid: string;
  frameOfReferenceUid: string;
  patientName: string;
  patientId: string;
  patientBirthDate: string;
  patientSex: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  accessionNumber: string;
  modality: string;
  magneticFieldStrength: number | undefined;
  seriesNumber: number | undefined;
  seriesDescription: string;
  protocolName: string;
  instanceNumber: number | undefined;
  imageType: string[];
  scanningSequence: string[];
  echoTime: number | undefined;
  repetitionTime: number | undefined;
  inversionTime: number | undefined;
  flipAngle: number | undefined;
  contrastAgent: string;
  temporalPosition: number | undefined;
  acquisitionNumber: number | undefined;
  triggerTime: number | undefined;
  bValue: number | undefined;
  gradient: [number, number, number] | undefined;
  echoNumber: number | undefined;
  imagePosition: [number, number, number] | undefined;
  imageOrientation: number[] | undefined;
  pixelSpacing: [number, number] | undefined;
  rows: number;
  columns: number;
  numberOfFrames: number;
  hasPixelData: boolean;
  /** First Window Center/Width pair, if recorded (GEN-232). */
  windowCenter: number | undefined;
  windowWidth: number | undefined;
  sliceThickness: number | undefined;
  sliceLocation: number | undefined;
}

export type HeaderResult =
  | { status: "ok"; header: InstanceHeader; dataSet: DataSet }
  | { status: "skip"; why: "dicomdir" }
  | { status: "quarantine"; reason: QuarantineReasonCode; detail: string };

export const SOP_CLASS = {
  mrImage: "1.2.840.10008.5.1.4.1.1.4",
  mrSpectroscopy: "1.2.840.10008.5.1.4.1.1.4.2",
  parametricMap: "1.2.840.10008.5.1.4.1.1.30",
  secondaryCapturePrefix: "1.2.840.10008.5.1.4.1.1.7",
  mediaStorageDirectory: "1.2.840.10008.1.3.10",
} as const;

/** SOP classes that legitimately carry no pixel data. */
const NON_IMAGE_PREFIXES = [
  SOP_CLASS.mrSpectroscopy,
  "1.2.840.10008.5.1.4.1.1.88.", // structured reports
  "1.2.840.10008.5.1.4.1.1.11.", // presentation states
  "1.2.840.10008.5.1.4.1.1.104.", // encapsulated documents
  "1.2.840.10008.5.1.4.1.1.66", // raw data, spatial registration
  "1.2.840.10008.5.1.4.1.1.481.", // RT objects
];

const PIXEL_TAGS = ["x7fe00010", "x7fe00008", "x7fe00009"];

function decoderFor(charset: string): TextDecoder {
  // ISO_IR 192 is UTF-8; ISO_IR 100 is Latin-1. Other single-byte sets fall back to Latin-1, which
  // keeps ASCII intact; multi-byte Asian sets are rare in this product's markets.
  const label = charset.includes("ISO_IR 192") ? "utf-8" : "latin1";
  return new TextDecoder(label);
}

class Reader {
  private readonly decoder: TextDecoder;
  constructor(private readonly ds: DataSet) {
    const raw = ds.string("x00080005") ?? "";
    this.decoder = decoderFor(raw);
  }
  private element(tag: string): Element | undefined {
    const el = this.ds.elements[tag];
    return el && el.length > 0 ? el : undefined;
  }
  /** All values of a string element, decoded with the instance's character set and trimmed. */
  strings(tag: string): string[] {
    const el = this.element(tag);
    if (!el) return [];
    const bytes = this.ds.byteArray.subarray(el.dataOffset, el.dataOffset + el.length);
    return this.decoder
      .decode(bytes)
      .split("\\")
      .map((v) => v.replace(/[\0 ]+$/, "").replace(/^ +/, ""));
  }
  str(tag: string): string {
    return this.strings(tag)[0] ?? "";
  }
  /** Decimal or integer string (DS/IS); undefined when absent or not a finite number. */
  num(tag: string, index = 0): number | undefined {
    const v = this.strings(tag)[index];
    if (v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  nums(tag: string): number[] {
    return this.strings(tag).map(Number).filter(Number.isFinite);
  }
  double(tag: string, index = 0): number | undefined {
    const el = this.element(tag);
    if (!el || el.length < (index + 1) * 8) return undefined;
    return this.ds.double(tag, index);
  }
  float(tag: string, index = 0): number | undefined {
    const el = this.element(tag);
    if (!el || el.length < (index + 1) * 4) return undefined;
    return this.ds.float(tag, index);
  }
  uint16(tag: string): number | undefined {
    return this.element(tag) ? this.ds.uint16(tag) : undefined;
  }
  /** Private creator of block `xx` in group `gggg`, e.g. creator("0019", "10"). */
  creator(group: string, block: string): string {
    return this.str(`x${group}00${block}`);
  }
}

function triple(v: number[]): [number, number, number] | undefined {
  return v.length === 3 && v.every(Number.isFinite) ? [v[0] as number, v[1] as number, v[2] as number] : undefined;
}

/** Standard attribute first, then the three main vendors' private fields. */
function diffusion(r: Reader): { bValue: number | undefined; gradient: [number, number, number] | undefined } {
  let bValue = r.double("x00189087");
  let gradient = triple([0, 1, 2].map((i) => r.double("x00189089", i)).filter((v): v is number => v !== undefined));
  if (r.creator("0019", "10").startsWith("SIEMENS MR HEADER")) {
    bValue ??= r.num("x0019100c");
    gradient ??= triple([0, 1, 2].map((i) => r.double("x0019100e", i)).filter((v): v is number => v !== undefined));
  }
  if (bValue === undefined && r.creator("2001", "10").startsWith("Philips Imaging DD 001")) bValue = r.float("x20011003");
  if (bValue === undefined && r.creator("0043", "10").startsWith("GEMS_PARM_01")) {
    const ge = r.num("x00431039");
    if (ge !== undefined) bValue = ge % 1e9;
  }
  return { bValue, gradient };
}

/** Reads one file's header. Never throws: every failure becomes a quarantine reason (DIR-006). */
export function readHeader(bytes: Uint8Array): HeaderResult {
  if (bytes.length < 8) return { status: "quarantine", reason: "not-dicom", detail: "file is too short" };
  const hasMagic = hasPart10Magic(bytes);
  const parsed = parseBytes(bytes);
  if (typeof parsed === "string") {
    return { status: "quarantine", reason: hasMagic ? "unreadable" : "not-dicom", detail: parsed };
  }
  const r = new Reader(parsed);
  const sopClassUid = r.str("x00080016") || r.str("x00020002");
  if (sopClassUid === SOP_CLASS.mediaStorageDirectory) return { status: "skip", why: "dicomdir" };
  const sopInstanceUid = r.str("x00080018") || r.str("x00020003");
  const studyInstanceUid = r.str("x0020000d");
  const seriesInstanceUid = r.str("x0020000e");
  if (!hasMagic && !sopInstanceUid && !studyInstanceUid) {
    return { status: "quarantine", reason: "not-dicom", detail: "no DICOM header found" };
  }
  const missing = [
    ["Study Instance UID", studyInstanceUid],
    ["Series Instance UID", seriesInstanceUid],
    ["SOP Instance UID", sopInstanceUid],
  ].filter(([, v]) => !v);
  if (missing.length > 0) {
    return { status: "quarantine", reason: "missing-uid", detail: missing.map(([n]) => n).join(", ") };
  }
  const hasPixelData = PIXEL_TAGS.some((t) => parsed.elements[t] !== undefined);
  const nonImage = NON_IMAGE_PREFIXES.some((p) => sopClassUid === p || sopClassUid.startsWith(p));
  if (!hasPixelData && !nonImage) return { status: "quarantine", reason: "no-pixel-data", detail: "image without pixel data" };

  const { bValue, gradient } = diffusion(r);
  const header: InstanceHeader = {
    sopInstanceUid,
    sopClassUid,
    transferSyntaxUid: r.str("x00020010") || "1.2.840.10008.1.2",
    studyInstanceUid,
    seriesInstanceUid,
    frameOfReferenceUid: r.str("x00200052"),
    patientName: r.str("x00100010"),
    patientId: r.str("x00100020"),
    patientBirthDate: r.str("x00100030"),
    patientSex: r.str("x00100040"),
    studyDate: r.str("x00080020"),
    studyTime: r.str("x00080030"),
    studyDescription: r.str("x00081030"),
    accessionNumber: r.str("x00080050"),
    modality: r.str("x00080060"),
    magneticFieldStrength: r.num("x00180087"),
    seriesNumber: r.num("x00200011"),
    seriesDescription: r.str("x0008103e"),
    protocolName: r.str("x00181030"),
    instanceNumber: r.num("x00200013"),
    imageType: r.strings("x00080008").map((v) => v.toUpperCase()),
    scanningSequence: r.strings("x00180020").map((v) => v.toUpperCase()),
    echoTime: r.num("x00180081"),
    repetitionTime: r.num("x00180080"),
    inversionTime: r.num("x00180082"),
    flipAngle: r.num("x00181314"),
    contrastAgent: r.str("x00180010"),
    temporalPosition: r.num("x00200100"),
    acquisitionNumber: r.num("x00200012"),
    triggerTime: r.num("x00181060"),
    bValue,
    gradient,
    echoNumber: r.num("x00180086"),
    imagePosition: triple(r.nums("x00200032")),
    imageOrientation: r.nums("x00200037").length === 6 ? r.nums("x00200037") : undefined,
    pixelSpacing: ((v) => (v.length === 2 ? ([v[0], v[1]] as [number, number]) : undefined))(r.nums("x00280030")),
    rows: r.uint16("x00280010") ?? 0,
    columns: r.uint16("x00280011") ?? 0,
    numberOfFrames: r.num("x00280008") ?? 1,
    hasPixelData,
    windowCenter: r.num("x00281050"),
    windowWidth: r.num("x00281051"),
    sliceThickness: r.num("x00180050"),
    sliceLocation: r.num("x00201041"),
  };
  return { status: "ok", header, dataSet: parsed };
}
