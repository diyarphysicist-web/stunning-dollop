import { Enums, RenderingEngine, cache, getShouldUseCPURendering, init, metaData, registerImageLoader, utilities, type Types } from "@cornerstonejs/core";
import type { ViewerImageInfo, ViewerPixels, ViewerStack } from "@neuromr/contracts";

/** Fetches modality values of one image by UID (GEN-234); undefined when the request failed. */
export type FetchPixels = (sopInstanceUid: string) => Promise<ViewerPixels | undefined>;
let fetchPixels: FetchPixels = () => Promise.resolve(undefined);

const SCHEME = "neuromr";
export const imageId = (sop: string): string => `${SCHEME}:${sop}`;
const sopOf = (id: string): string => id.slice(SCHEME.length + 1);

/** Geometry of every image the viewer has been given, for the metadata provider. */
const infos = new Map<string, ViewerImageInfo>();
const inverted = new Map<string, boolean>();

export function registerStack(stack: ViewerStack): void {
  for (const i of stack.images) infos.set(i.sopInstanceUid, i);
}

/** Why an image could not be drawn, for the viewport notice. */
export class ImageUnavailable extends Error {
  constructor(readonly reason: "unsupported" | "missing" | "failed") {
    super(reason);
  }
}

/**
 * Loads modality values over the bridge (GEN-234) and wraps them as a Cornerstone image. Values are
 * already rescaled (GEN-232), so slope 1 and intercept 0.
 */
function loadImage(id: string): Types.IImageLoadObject {
  const sop = sopOf(id);
  const promise = fetchPixels(sop).then((px): Types.IImage => {
    if (!px) throw new ImageUnavailable("failed");
    if (px.status !== "ok") throw new ImageUnavailable(px.status);
    inverted.set(sop, px.invert);
    const { width, height, values } = px;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const info = infos.get(sop);
    const voxelManager = utilities.VoxelManager.createImageVoxelManager({ width, height, numberOfComponents: 1, scalarData: values, id });
    const image = {
      imageId: id,
      minPixelValue: min,
      maxPixelValue: max,
      slope: 1,
      intercept: 0,
      windowCenter: info?.windowCenter ?? (min + max) / 2,
      windowWidth: info?.windowWidth ?? Math.max(max - min, 1),
      voiLUTFunction: Enums.VOILUTFunctionType.LINEAR,
      getPixelData: () => values,
      getCanvas: () => {
        throw new Error("not a colour image");
      },
      rows: height,
      columns: width,
      height,
      width,
      color: false,
      rgba: false,
      numberOfComponents: 1,
      columnPixelSpacing: info?.pixelSpacing?.[1] ?? 1,
      rowPixelSpacing: info?.pixelSpacing?.[0] ?? 1,
      invert: px.invert,
      photometricInterpretation: px.invert ? "MONOCHROME1" : "MONOCHROME2",
      sizeInBytes: values.byteLength,
      dataType: "Float32Array",
      voxelManager,
      FrameOfReferenceUID: info?.frameOfReferenceUid ?? "",
    } as Types.IImage;
    return image;
  });
  return { promise };
}

/** Metadata Cornerstone asks for, from the stack geometry (GEN-231). */
function provider(type: string, id: string): unknown {
  if (!id.startsWith(`${SCHEME}:`)) return undefined;
  const sop = sopOf(id);
  const i = infos.get(sop);
  if (!i) return undefined;
  const spacing = i.pixelSpacing ?? [1, 1];
  const iop = i.orientation ?? [1, 0, 0, 0, 1, 0];
  switch (type) {
    case "imagePlaneModule":
      return {
        frameOfReferenceUID: i.frameOfReferenceUid,
        rows: i.rows,
        columns: i.columns,
        imageOrientationPatient: iop,
        rowCosines: iop.slice(0, 3),
        columnCosines: iop.slice(3, 6),
        imagePositionPatient: i.position ?? [0, 0, 0],
        pixelSpacing: spacing,
        rowPixelSpacing: spacing[0],
        columnPixelSpacing: spacing[1],
      };
    case "imagePixelModule":
      return {
        samplesPerPixel: 1,
        photometricInterpretation: inverted.get(sop) ? "MONOCHROME1" : "MONOCHROME2",
        rows: i.rows,
        columns: i.columns,
        bitsAllocated: 32,
        bitsStored: 32,
        highBit: 31,
        pixelRepresentation: 1,
      };
    case "generalSeriesModule":
      return { modality: "MR" };
    case "modalityLutModule":
      return { rescaleSlope: 1, rescaleIntercept: 0 };
    case "voiLutModule":
      return i.windowCenter !== null && i.windowWidth !== null ? { windowCenter: [i.windowCenter], windowWidth: [i.windowWidth] } : undefined;
    default:
      return undefined;
  }
}

let engine: RenderingEngine | null = null;

/** Starts Cornerstone once; without WebGL it draws on the CPU (GEN-235). */
export function startViewer(fetch: FetchPixels): RenderingEngine {
  fetchPixels = fetch;
  if (engine) return engine;
  // init() switches to CPU rendering by itself when no WebGL context can be created.
  init();
  registerImageLoader(SCHEME, loadImage as unknown as Types.ImageLoaderFn);
  metaData.addProvider(provider, 10000);
  engine = new RenderingEngine("neuromr-viewer");
  return engine;
}

/** The running engine; startViewer must have been called. */
export function renderingEngine(): RenderingEngine {
  if (!engine) throw new Error("startViewer was not called");
  return engine;
}

export const softwareRendering = (): boolean => getShouldUseCPURendering();

/** Frees cached images that belong to series no longer shown. */
export function purge(keep: ReadonlySet<string>): void {
  for (const sop of [...infos.keys()]) {
    if (keep.has(sop)) continue;
    const id = imageId(sop);
    if (cache.getImageLoadObject(id)) cache.removeImageLoadObject(id);
    infos.delete(sop);
    inverted.delete(sop);
  }
}
