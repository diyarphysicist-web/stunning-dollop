/** Patient-space vector (DICOM LPS: +x Left, +y Posterior, +z Superior). */
export type Vec3 = readonly [number, number, number];

export interface Markers {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** Display transform from the viewing tools (GEN-130); rotation in quarter turns clockwise. */
export interface ViewTransform {
  mirror: boolean;
  flip: boolean;
  quarterTurns: number;
}

const LETTERS: readonly [string, string][] = [
  ["L", "R"],
  ["P", "A"],
  ["S", "I"],
];

/**
 * Orientation letters for a direction (SAFE-040): every patient axis contributing more than
 * `threshold` of the unit vector, strongest first ("L", or "LA" for an oblique view).
 */
export function directionLabel(v: Vec3, threshold = 0.25): string {
  const len = Math.hypot(...v) || 1;
  return v
    .map((c, i) => ({ c: c / len, i }))
    .filter(({ c }) => Math.abs(c) > threshold)
    .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 3)
    .map(({ c, i }) => (LETTERS[i] as [string, string])[c > 0 ? 0 : 1])
    .join("");
}

const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** Markers for the screen's right and down directions expressed in patient space. */
export function markersFromScreenAxes(right: Vec3, down: Vec3): Markers {
  return { right: directionLabel(right), left: directionLabel(neg(right)), bottom: directionLabel(down), top: directionLabel(neg(down)) };
}

/**
 * Screen axes of an image (Image Orientation Patient: row then column cosines) after the
 * viewing tools, applied in screen space: mirror swaps left/right, flip swaps top/bottom, and each
 * clockwise quarter turn moves the top edge to the right.
 */
export function screenAxes(iop: readonly number[], t: ViewTransform): { right: Vec3; down: Vec3 } {
  let right: Vec3 = [iop[0] ?? 1, iop[1] ?? 0, iop[2] ?? 0];
  let down: Vec3 = [iop[3] ?? 0, iop[4] ?? 1, iop[5] ?? 0];
  if (t.mirror) right = neg(right);
  if (t.flip) down = neg(down);
  const turns = ((t.quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) [right, down] = [neg(down), right];
  return { right, down };
}

export const IDENTITY: ViewTransform = { mirror: false, flip: false, quarterTurns: 0 };
