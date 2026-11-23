import type { SeriesType } from "@neuromr/contracts";
import { SOP_CLASS } from "./header.js";
import type { SeriesFacts } from "./series.js";

/** True when one of `keys` starts a word of the description (ALGORITHMS.md §13, keyword matching). */
function keyword(words: readonly string[], keys: readonly string[]): boolean {
  return words.some((w) => keys.some((k) => w.startsWith(k)));
}

/** Two consecutive words, e.g. "dyn t1". */
function phrase(words: readonly string[], a: string, b: string): boolean {
  return words.some((w, i) => w === a && words[i + 1] === b);
}

function dynamicType(f: SeriesFacts): SeriesType[] {
  if (keyword(f.words, ["perf", "dsc", "pwi"])) return ["DSC"];
  if (keyword(f.words, ["bold", "fmri", "functional"])) return ["FMRI"];
  if (keyword(f.words, ["dce", "vibe", "thrive"]) || phrase(f.words, "dyn", "t1")) return ["DCE", "T1"];
  const te = f.echoTime;
  if (te !== undefined && te <= 10) return ["DCE", "T1"];
  if (te !== undefined) return f.contrastAgent ? ["DSC"] : ["FMRI"];
  return [];
}

/**
 * Series-type classifier (DIR-003). Ordered rules from ALGORITHMS.md §13; the first rule that
 * applies decides, except rule 10, which is the last. Types are listed in badge order.
 */
export function classify(f: SeriesFacts): SeriesType[] {
  const sop = f.sopClassUid;
  if (sop.startsWith(SOP_CLASS.secondaryCapturePrefix)) return ["SECONDARY_CAPTURE"];
  if (sop === SOP_CLASS.mrSpectroscopy) return [f.spectroscopyVoxels <= 1 ? "MRS_SVS" : "MRS_CSI"];
  if (sop === SOP_CLASS.parametricMap || f.imageType[0] === "DERIVED") return ["DERIVED_MAP"];
  if (f.bValues.some((b) => b > 0)) return f.gradientDirections >= 6 ? ["DTI", "DWI"] : ["DWI"];
  if (f.dynamics >= 2) return dynamicType(f);
  if (f.echoes >= 2) return ["MULTI_ECHO"];
  if (f.imageType.includes("SWI") || keyword(f.words, ["swi", "susc"])) return ["SWI"];

  const te = f.echoTime;
  const tr = f.repetitionTime;
  const ti = f.inversionTime;
  if ((ti !== undefined && ti >= 1500 && te !== undefined && te >= 60) || keyword(f.words, ["flair"])) return ["FLAIR"];
  if (te !== undefined && tr !== undefined && te <= 15 && tr <= 800) {
    const gre = f.scanningSequence.includes("GR") && !f.scanningSequence.includes("IR");
    return gre && f.flipAngle !== undefined ? ["VFA_REFERENCE", "T1"] : ["T1"];
  }
  if (te !== undefined && tr !== undefined && te >= 60 && tr >= 2000) return ["T2"];
  return [];
}
