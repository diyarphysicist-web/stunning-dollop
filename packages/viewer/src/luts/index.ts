/**
 * Map look-up tables and data palettes (GEN-140, brief §4.2). These colours are data,
 * not chrome; this folder is the only place outside the design tokens allowed to hold
 * raw colour values (enforced by the lint rule in eslint.config.js).
 */

export type Rgb = readonly [number, number, number];
export type LutName = "gray" | "blueToRed" | "stroke" | "hot" | "viridis";

const hex = (h: string): Rgb => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Evenly spaced control points from minimum to maximum value. */
const CONTROL_POINTS: Record<LutName, readonly string[]> = {
  gray: ["#000000", "#FFFFFF"],
  blueToRed: ["#0000FF", "#00C000", "#FFFF00", "#FF9900", "#FF0000"],
  stroke: ["#000000", "#7FD4FF", "#00C040", "#FFC000", "#FF0000"],
  hot: ["#000000", "#FF0000", "#FFFF00", "#FFFFFF"],
  viridis: ["#440154", "#472C7A", "#3B518B", "#2C718E", "#21908D", "#27AD81", "#5CC863", "#AADC32", "#FDE725"],
};

export const LUT_NAMES = Object.keys(CONTROL_POINTS) as LutName[];

/** Build a 256-entry RGB table by linear interpolation between control points. */
export function buildLut(name: LutName, size = 256): Rgb[] {
  const pts = CONTROL_POINTS[name].map(hex);
  const out: Rgb[] = [];
  for (let i = 0; i < size; i++) {
    const pos = (i / (size - 1)) * (pts.length - 1);
    const k = Math.min(Math.floor(pos), pts.length - 2);
    const f = pos - k;
    const [ar, ag, ab] = pts[k] as Rgb;
    const [br, bg, bb] = pts[k + 1] as Rgb;
    const mix = (x: number, y: number): number => Math.round(x + (y - x) * f);
    out.push([mix(ar, br), mix(ag, bg), mix(ab, bb)]);
  }
  return out;
}

/** ROI colours, Okabe–Ito based, assigned ROI1…ROI8 (GEN-035). White replaces black for a dark viewport. */
export const ROI_PALETTE: readonly string[] = [
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7",
  "#FFFFFF",
];

export const roiColor = (index: number): string => ROI_PALETTE[index % ROI_PALETTE.length] as string;

/** Mismatch overlays (MM-008): diffusion core and perfusion deficit; penumbra uses the deficit colour hatched. */
export const MISMATCH_PALETTE = { core: "#D55E00", deficit: "#56B4E9", penumbra: "#56B4E9" } as const;
