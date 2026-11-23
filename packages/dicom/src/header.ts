import type { DataSet, Element } from "dicom-parser";
import { imageRef, parseImageRef } from "@neuromr/contracts";
import { LOSSY_SYNTAXES } from "./decode.js";

export { imageRef, parseImageRef };
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
  /** Lossy Image Compression (0028,2110) is 01 or the transfer syntax is lossy (GEN-239). Absent in older index rows. */
  lossy?: boolean;
  /** Per-frame values of a multi-frame instance with functional groups (GEN-240); see `expandFrames`. */
  frames?: FrameFacts[];
  /** Frame number (0-based) of a header produced by `expandFrames`. */
  frame?: number;
  /** Rescale of an expanded frame (Pixel Value Transformation); classic images keep it in the file. */
  rescaleSlope?: number;
  rescaleIntercept?: number;
}

/** Values one frame takes from its functional groups (GEN-240). */
export interface FrameFacts {
  imagePosition?: [number, number, number];
  imageOrientation?: number[];
  pixelSpacing?: [number, number];
  sliceThickness?: number;
  temporalPosition?: number;
  /** Milliseconds from the first frame (Temporal Position Time Offset or Frame Acquisition DateTime). */
  triggerTime?: number;
  echoTime?: number;
  repetitionTime?: number;
  flipAngle?: number;
  inversionTime?: number;
  bValue?: number;
  gradient?: [number, number, number];
  rescaleSlope?: number;
  rescaleIntercept?: number;
  windowCenter?: number;
  windowWidth?: number;
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
  constructor(
    private readonly ds: DataSet,
    decoder?: TextDecoder,
  ) {
    this.decoder = decoder ?? decoderFor(ds.string("x00080005") ?? "");
  }
  /** First item of a sequence, read with this instance's character set. */
  item(tag: string, index = 0): Reader | undefined {
    const item = this.ds.elements[tag]?.items?.[index]?.dataSet;
    return item ? new Reader(item, this.decoder) : undefined;
  }
  count(tag: string): number {
    return this.ds.elements[tag]?.items?.length ?? 0;
  }
  uint32(tag: string): number | undefined {
    return this.element(tag) ? this.ds.uint32(tag) : undefined;
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

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };
const defined = <T extends object>(o: T): Defined<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Defined<T>;

/** DICOM DT (YYYYMMDDHHMMSS.FFFFFF) as milliseconds since the epoch, ignoring any offset. */
function dateTimeMs(dt: string): number | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:\.(\d{1,6}))?/.exec(dt);
  if (!m) return undefined;
  const [, y = "0", mo = "1", d = "1", h = "0", mi = "0", sec = "0", frac = "0"] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) + Number(`0.${frac}`) * 1000;
}

/** Functional group macros of one group item (shared or per-frame), PS3.3 C.7.6.16. */
function groupFacts(g: Reader): FrameFacts & { acquisitionMs?: number } {
  const pos = g.item("x00209113");
  const ori = g.item("x00209116");
  const pm = g.item("x00289110");
  const fc = g.item("x00209111");
  const tp = g.item("x00209310");
  const echo = g.item("x00189114");
  const timing = g.item("x00189112");
  const mod = g.item("x00189115");
  const diff = g.item("x00189117");
  const pvt = g.item("x00289145");
  const voi = g.item("x00289132");
  const spacing = pm?.nums("x00280030") ?? [];
  const orientation = ori?.nums("x00200037") ?? [];
  const offset = tp?.double("x0020930d");
  const directional = diff ? diff.str("x00189075").toUpperCase() !== "NONE" && diff.str("x00189075").toUpperCase() !== "ISOTROPIC" : false;
  const grad = diff?.item("x00189076");
  return defined({
    imagePosition: pos ? triple(pos.nums("x00200032")) : undefined,
    imageOrientation: orientation.length === 6 ? orientation : undefined,
    pixelSpacing: spacing.length === 2 ? ([spacing[0], spacing[1]] as [number, number]) : undefined,
    sliceThickness: pm?.num("x00180050"),
    temporalPosition: fc?.uint32("x00209128"),
    triggerTime: offset !== undefined ? offset * 1000 : undefined,
    acquisitionMs: fc ? dateTimeMs(fc.str("x00189074")) : undefined,
    echoTime: echo?.double("x00189082"),
    repetitionTime: timing?.num("x00180080"),
    flipAngle: timing?.num("x00181314"),
    inversionTime: mod?.double("x00189079"),
    bValue: diff?.double("x00189087"),
    gradient: directional && grad ? triple([0, 1, 2].map((i) => grad.double("x00189089", i)).filter((v): v is number => v !== undefined)) : undefined,
    rescaleSlope: pvt?.num("x00281053"),
    rescaleIntercept: pvt?.num("x00281052"),
    windowCenter: voi?.num("x00281050"),
    windowWidth: voi?.num("x00281051"),
  });
}

/** Per-frame values of a multi-frame instance with functional groups; undefined for other images. */
function frameFacts(r: Reader): FrameFacts[] | undefined {
  const n = r.count("x52009230");
  if (n === 0) return undefined;
  const sharedItem = r.item("x52009229");
  const shared = sharedItem ? groupFacts(sharedItem) : {};
  const frames = Array.from({ length: n }, (_, k) => {
    const item = r.item("x52009230", k);
    return { ...shared, ...(item ? groupFacts(item) : {}) };
  });
  // Times relative to the first frame; acquisition date-times stand in for missing time offsets.
  const offsets = frames.map((f) => f.triggerTime ?? f.acquisitionMs);
  const t0 = Math.min(...offsets.filter((v): v is number => v !== undefined));
  return frames.map(({ acquisitionMs, ...f }, k) => {
    void acquisitionMs;
    const t = offsets[k];
    return t === undefined || !Number.isFinite(t0) ? f : { ...f, triggerTime: t - t0 };
  });
}

/** Rescale of one frame from its functional groups (GEN-240), else undefined. */
export function frameRescale(ds: DataSet, frame: number): { slope: number; intercept: number } | undefined {
  const r = new Reader(ds);
  const shared = r.item("x52009229");
  const own = r.item("x52009230", frame);
  const f = { ...(shared ? groupFacts(shared) : {}), ...(own ? groupFacts(own) : {}) };
  if (f.rescaleSlope === undefined && f.rescaleIntercept === undefined) return undefined;
  return { slope: f.rescaleSlope ?? 1, intercept: f.rescaleIntercept ?? 0 };
}

/**
 * One header per frame for multi-frame instances with functional groups (GEN-240); other headers
 * are returned unchanged. Frame values win over the instance's top-level attributes.
 */
export function expandFrames(h: InstanceHeader): InstanceHeader[] {
  const { frames, ...base } = h;
  if (!frames?.length) return [h];
  return frames.map((f, frame) => ({
    ...base,
    frame,
    numberOfFrames: 1,
    imagePosition: f.imagePosition ?? base.imagePosition,
    imageOrientation: f.imageOrientation ?? base.imageOrientation,
    pixelSpacing: f.pixelSpacing ?? base.pixelSpacing,
    sliceThickness: f.sliceThickness ?? base.sliceThickness,
    temporalPosition: f.temporalPosition ?? base.temporalPosition,
    triggerTime: f.triggerTime ?? base.triggerTime,
    echoTime: f.echoTime ?? base.echoTime,
    repetitionTime: f.repetitionTime ?? base.repetitionTime,
    flipAngle: f.flipAngle ?? base.flipAngle,
    inversionTime: f.inversionTime ?? base.inversionTime,
    bValue: f.bValue ?? base.bValue,
    gradient: f.gradient ?? base.gradient,
    windowCenter: f.windowCenter ?? base.windowCenter,
    windowWidth: f.windowWidth ?? base.windowWidth,
    ...defined({ rescaleSlope: f.rescaleSlope, rescaleIntercept: f.rescaleIntercept }),
  }));
}

/** Classic Scanning Sequence from Enhanced MR Pulse Sequence attributes (ALGORITHMS.md §13). */
function enhancedScanning(r: Reader): string[] {
  const echo = r.str("x00189008").toUpperCase();
  const out = echo === "SPIN" ? ["SE"] : echo === "GRADIENT" ? ["GR"] : echo === "BOTH" ? ["SE", "GR"] : [];
  if (r.str("x00189018").toUpperCase() === "YES") out.push("EP");
  if (r.str("x00189009").toUpperCase() === "YES") out.push("IR");
  return out;
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
  const frames = frameFacts(r);
  const first = frames?.[0];
  const scanning = r.strings("x00180020").map((v) => v.toUpperCase());
  const agentItem = r.item("x00180012");
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
    scanningSequence: scanning.some(Boolean) ? scanning : enhancedScanning(r),
    echoTime: r.num("x00180081") ?? first?.echoTime,
    repetitionTime: r.num("x00180080") ?? first?.repetitionTime,
    inversionTime: r.num("x00180082") ?? first?.inversionTime,
    flipAngle: r.num("x00181314") ?? first?.flipAngle,
    contrastAgent: r.str("x00180010") || (agentItem ? agentItem.str("x00080104") || agentItem.str("x00080100") || "recorded" : ""),
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
    lossy: r.str("x00282110") === "01" || LOSSY_SYNTAXES.has(r.str("x00020010")),
  };
  if (frames) header.frames = frames;
  return { status: "ok", header, dataSet: parsed };
}
