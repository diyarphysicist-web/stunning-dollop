import type { SeriesRow, StudyRow } from "@neuromr/contracts";
import { t } from "@neuromr/i18n";

function matrix(s: SeriesRow): string {
  return s.rows === s.columns ? t("dims.matrixSquare", { n: s.columns }) : t("dims.matrix", { columns: s.columns, rows: s.rows });
}

/** Dimensions column of the series list (DIR-009): time points, volumes or echoes × slices · matrix. */
export function dimensions(s: SeriesRow): string {
  if (s.types.includes("MRS_SVS") || s.types.includes("MRS_CSI")) return t("dims.spectroscopy", { n: Math.max(1, s.rows * s.columns) });
  const slices = Math.max(1, s.slices);
  if (s.bValues.length > 0 && s.bValues.some((b) => b > 0)) {
    const volumes = Math.round(s.imageCount / slices);
    return s.gradientDirections > 0
      ? t("dims.diffusionDirections", { volumes, slices, directions: s.gradientDirections })
      : t("dims.diffusion", { b: s.bValues.length, slices });
  }
  if (s.isDynamic) return t("dims.dynamic", { dyn: s.dynamics, slices, matrix: matrix(s) });
  if (s.echoes >= 2) return t("dims.echo", { echoes: s.echoes, slices, matrix: matrix(s) });
  const base = t("dims.static", { slices, matrix: matrix(s) });
  return s.types.includes("VFA_REFERENCE") && s.flipAngleDeg !== undefined ? t("dims.flip", { base, deg: s.flipAngleDeg }) : base;
}

/** Whole years between ISO dates, or undefined when either is missing (SAFE-001 banner). */
export function ageYears(birth: string, at: string): number | undefined {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at);
  if (!b || !a) return undefined;
  const [by, bm, bd] = b.slice(1).map(Number) as [number, number, number];
  const [ay, am, ad] = a.slice(1).map(Number) as [number, number, number];
  const years = ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
  return years >= 0 ? years : undefined;
}

export function modalityLabel(study: StudyRow): string {
  return study.fieldStrengthT ? t("modality.withField", { modality: study.modality, tesla: study.fieldStrengthT }) : study.modality;
}
