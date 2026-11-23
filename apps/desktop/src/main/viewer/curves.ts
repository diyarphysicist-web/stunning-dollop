import { parseImageRef, type RoiCurveQuery, type RoiCurves } from "@neuromr/contracts";
import { roiMask, roiStats } from "@neuromr/viewer";
import type { StudyIndex } from "../directory/study-index.js";
import type { DecodeImage } from "../pixels/decode-image.js";
import { imagePixels, seriesStack } from "./viewer.js";

/**
 * GEN-245: mean inside each ROI (GEN-236 voxel rule) at its slice for every point of the series'
 * second axis. Images are decoded in the pixel worker, each once per call.
 */
export async function roiCurves(index: StudyIndex, query: RoiCurveQuery, decode: DecodeImage): Promise<RoiCurves> {
  const stack = seriesStack(index, query.seriesInstanceUid);
  const images = new Map<string, Promise<{ values: Float32Array; width: number; height: number } | null>>();
  const image = (ref: string) => {
    let pending = images.get(ref);
    if (!pending) {
      const { sopInstanceUid, frame } = parseImageRef(ref);
      pending = imagePixels(index, sopInstanceUid, frame, decode).then((px) => (px.status === "ok" ? { values: px.values, width: px.width, height: px.height } : null));
      images.set(ref, pending);
    }
    return pending;
  };
  return Promise.all(
    query.rois.map(async (roi) => {
      const row = stack.grid[roi.slice] ?? [];
      let mask: { key: string; indices: Uint32Array } | null = null;
      const values = await Promise.all(
        row.map(async (ref) => {
          const img = ref ? await image(ref) : null;
          if (!img) return null;
          const key = `${img.width}x${img.height}`;
          if (mask?.key !== key) mask = { key, indices: roiMask(roi.shape, img.width, img.height) };
          return roiStats(img.values, mask.indices)?.mean ?? null;
        }),
      );
      return { id: roi.id, values };
    }),
  );
}
