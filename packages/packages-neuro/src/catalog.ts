import type { PackageId } from "@neuromr/contracts";

/** Commercial modules (brief §12.7). */
export type LicenseModule = "core" | "perfusion" | "diffusion" | "stroke" | "neurosurgery" | "spectroscopy" | "follow-up";

export interface PackageInfo {
  id: PackageId;
  title: string;
  module: LicenseModule;
  /** Development phase that delivers the package; it stays hidden in the UI until then (rule 4). */
  phase: number;
}

export const PACKAGES: readonly PackageInfo[] = [
  { id: "dsc", title: "DSC Neuro Perfusion", module: "perfusion", phase: 3 },
  { id: "diffusion", title: "Diffusion", module: "diffusion", phase: 4 },
  { id: "dce", title: "DCE / T1 Perfusion", module: "perfusion", phase: 5 },
  { id: "permeability", title: "Permeability", module: "perfusion", phase: 5 },
  { id: "tractography", title: "Tractography", module: "neurosurgery", phase: 6 },
  { id: "fmri", title: "Brain Function", module: "neurosurgery", phase: 7 },
  { id: "spectroscopy", title: "Spectroscopy", module: "spectroscopy", phase: 8 },
  { id: "longitudinal", title: "Longitudinal Brain Analysis", module: "follow-up", phase: 9 },
  { id: "adv-diffusion", title: "Advanced Diffusion", module: "diffusion", phase: 10 },
  { id: "subtraction", title: "Subtraction", module: "core", phase: 10 },
  { id: "echo", title: "Echo Accumulation", module: "core", phase: 10 },
];

/** The Diffusion–Perfusion Mismatch stage needs Stroke plus both of its prerequisite modules. */
export const MISMATCH_MODULES: readonly LicenseModule[] = ["stroke", "perfusion", "diffusion"];

/** Packages visible to a user: delivered by the current build phase and covered by a licensed module. */
export function visiblePackages(buildPhase: number, licensed: ReadonlySet<LicenseModule>): PackageInfo[] {
  return PACKAGES.filter((p) => p.phase <= buildPhase && licensed.has(p.module));
}
