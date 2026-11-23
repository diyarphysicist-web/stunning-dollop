import type { Pt } from "./roi/index.js";
import type { Vec3 } from "./orientation/index.js";

/** Plane geometry of one image (DICOM: position of the first pixel's centre, orientation, spacing). */
export interface ImagePlane {
  /** Image Orientation Patient: row cosines then column cosines. */
  orientation: readonly number[] | null;
  position: readonly [number, number, number] | null;
  /** Row spacing, column spacing in mm (DICOM order). */
  pixelSpacing: readonly [number, number] | null;
}

function axes(p: ImagePlane) {
  const o = p.orientation?.length === 6 ? p.orientation : [1, 0, 0, 0, 1, 0];
  const [rowSp, colSp] = p.pixelSpacing ?? [1, 1];
  return {
    r: [o[0] ?? 1, o[1] ?? 0, o[2] ?? 0] as Vec3,
    c: [o[3] ?? 0, o[4] ?? 1, o[5] ?? 0] as Vec3,
    origin: p.position ?? [0, 0, 0],
    colSp,
    rowSp,
  };
}

/** Patient coordinates of an image point (x along columns, y along rows; pixel centres at +0.5). */
export function imageToWorld(p: ImagePlane, pt: Pt): Vec3 {
  const { r, c, origin, colSp, rowSp } = axes(p);
  const u = (pt[0] - 0.5) * colSp;
  const v = (pt[1] - 0.5) * rowSp;
  return [origin[0] + r[0] * u + c[0] * v, origin[1] + r[1] * u + c[1] * v, origin[2] + r[2] * u + c[2] * v];
}

/** Image point of a patient-space position projected onto the image plane. */
export function worldToImage(p: ImagePlane, w: Vec3): Pt {
  const { r, c, origin, colSp, rowSp } = axes(p);
  const d = [w[0] - origin[0], w[1] - origin[1], w[2] - origin[2]];
  const u = (d[0] as number) * r[0] + (d[1] as number) * r[1] + (d[2] as number) * r[2];
  const v = (d[0] as number) * c[0] + (d[1] as number) * c[1] + (d[2] as number) * c[2];
  return [u / colSp + 0.5, v / rowSp + 0.5];
}
