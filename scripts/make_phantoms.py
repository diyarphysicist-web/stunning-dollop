"""Generate the synthetic digital phantoms used for development and validation.

Usage (from the repository root):
    uv run --project engine python scripts/make_phantoms.py [--out data/phantoms] [--only dsc,dti]

Each phantom is written to <out>/<name>/ as a DICOM series (one folder per series) plus
truth.npz holding the ground truth. Spectroscopy phantoms are written as fid.npz in Phase 0;
the DICOM MR Spectroscopy writer is added with the Spectroscopy package (Phase 8).
Output goes to the git-ignored data/ folder and is fully synthetic.

Two families: the validation phantoms (stripes of tissue classes, for the ALGORITHMS.md gates)
and the anatomical brain phantom (`--only brain`, folders brain_*), one head with GM, WM, CSF and
ventricles plus a stroke, a tumour, MS-like lesions and task activation, written with the design
study's series numbers. The design imagery is rendered from the brain phantom.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from neuromr_engine.dicom.writer import SeriesSpec, StudySpec, write_series  # noqa: E402
from neuromr_engine.phantoms import brain, dce, diffusion, dsc, other  # noqa: E402
from neuromr_engine.phantoms.common import Phantom  # noqa: E402


def _save_truth(p: Phantom, folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    arrays = {k: np.asarray(v) for k, v in p.truth.items()}
    np.savez_compressed(folder / "truth.npz", **arrays)


def build(out: Path, only: set[str] | None) -> list[str]:
    done: list[str] = []
    study = StudySpec()

    def want(key: str) -> bool:
        return only is None or key in only

    if want("dsc"):
        for snr in (20, 50, 100):
            p = dsc.make_dsc(snr=snr)
            write_series(
                p.data,
                out / p.name / "dicom",
                study,
                SeriesSpec(
                    f"DSC perf SNR{snr}",
                    100 + snr,
                    "dynamic",
                    times_s=p.meta["times"],
                    te_ms=30.0,
                    tr_ms=p.meta["tr"] * 1000,
                    flip_deg=90.0,
                ),
            )
            _save_truth(p, out / p.name)
            done.append(p.name)
        p = dsc.make_dsc_leakage()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "DSC perf leakage",
                160,
                "dynamic",
                times_s=p.meta["times"],
                te_ms=30.0,
                tr_ms=p.meta["tr"] * 1000,
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("dce"):
        p = dce.make_dce_semiquant()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "T1 DCE semiquant",
                200,
                "dynamic",
                times_s=p.meta["times"],
                te_ms=2.0,
                tr_ms=5.0,
                flip_deg=15.0,
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)
        p = dce.make_tofts()
        write_series(
            p.data,
            out / p.name / "dicom_dce",
            study,
            SeriesSpec(
                "T1 DCE permeability",
                210,
                "dynamic",
                times_s=p.meta["times"],
                te_ms=2.0,
                tr_ms=p.meta["tr_ms"],
                flip_deg=p.meta["fa"],
            ),
        )
        for i, (fa, ref) in enumerate(p.meta["references"].items()):
            write_series(
                ref,
                out / p.name / f"dicom_vfa{int(fa)}",
                study,
                SeriesSpec(
                    f"T1 FFE VFA {int(fa)}deg", 211 + i, "none", te_ms=2.0, tr_ms=p.meta["tr_ms"], flip_deg=fa
                ),
            )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("dti"):
        for n_dirs, snr in ((6, None), (32, None), (32, 30.0), (64, 30.0)):
            p = diffusion.make_dti(n_dirs=n_dirs, bvals=(0.0, 1000.0), snr=snr)
            write_series(
                p.data,
                out / p.name / "dicom",
                study,
                SeriesSpec(
                    f"DTI {n_dirs}dir",
                    300 + n_dirs,
                    "bvalue",
                    bvals=p.meta["bvals"],
                    bvecs=p.meta["bvecs"],
                    te_ms=80.0,
                    tr_ms=6000.0,
                ),
            )
            _save_truth(p, out / p.name)
            done.append(p.name)
        p = diffusion.make_dti(n_dirs=32, bvals=(0.0, 500.0, 1000.0, 2000.0), snr=30.0)
        p.name = "dti_multishell_snr30"
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "DTI multishell",
                399,
                "bvalue",
                bvals=p.meta["bvals"],
                bvecs=p.meta["bvecs"],
                te_ms=90.0,
                tr_ms=7000.0,
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("ivim"):
        p = diffusion.make_ivim_dki()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec("DWI IVIM DKI", 400, "bvalue", bvals=p.meta["bvals"], te_ms=80.0, tr_ms=5000.0),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("fmri"):
        p = other.make_fmri()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "fMRI BOLD block",
                500,
                "dynamic",
                times_s=p.meta["times"],
                te_ms=30.0,
                tr_ms=p.meta["tr"] * 1000,
                flip_deg=80.0,
                pixel_mm=3.0,
                slice_mm=3.0,
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("mrs"):
        p = other.make_svs()
        folder = out / p.name
        folder.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            folder / "fid.npz", fid=p.data, **{k: np.asarray(v) for k, v in p.meta.items() if k != "kind"}
        )
        _save_truth(p, folder)
        done.append(p.name)

    if want("flair"):
        base, foll = other.make_flair_pair()
        fu_study = StudySpec(study_date="20260701", accession="PHANTOM0002", seed="neuromr-phantom-fu")
        for ph, st, num in ((base, study, 600), (foll, fu_study, 601)):
            write_series(
                ph.data,
                out / ph.name / "dicom",
                st,
                SeriesSpec(
                    "3D FLAIR",
                    num,
                    "none",
                    te_ms=120.0,
                    tr_ms=4800.0,
                    pixel_mm=1.0,
                    slice_mm=1.0,
                    flip_deg=90.0,
                ),
            )
            _save_truth(ph, out / ph.name)
            done.append(ph.name)

    if want("swi"):
        p = other.make_swi_epi()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "SWI EPI",
                610,
                "none",
                te_ms=p.meta["te_ms"],
                tr_ms=p.meta["tr_ms"],
                pixel_mm=1.0,
                slice_mm=1.0,
                flip_deg=90.0,
                image_type=("ORIGINAL", "PRIMARY", "M", "SWI"),
                extra={"ScanningSequence": "EP", "SequenceVariant": "SK"},
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)

    if want("echo"):
        p = other.make_multi_echo()
        write_series(
            p.data,
            out / p.name / "dicom",
            study,
            SeriesSpec(
                "Multi-echo GRE",
                620,
                "echo",
                echo_times_ms=p.meta["te_ms"],
                tr_ms=p.meta["tr_ms"],
                flip_deg=p.meta["flip_deg"],
                pixel_mm=1.0,
                slice_mm=1.0,
            ),
        )
        _save_truth(p, out / p.name)
        done.append(p.name)
    if want("brain"):
        done += _build_brain(out, study)
    return done


def _write(p: Phantom, folder: Path, study: StudySpec, spec: SeriesSpec) -> None:
    """Write a series into an emptied folder, so a changed grid never leaves stale instances."""
    for old in folder.glob("*.dcm") if folder.exists() else ():
        old.unlink()
    write_series(p.data, folder, study, spec)


def _build_brain(out: Path, study: StudySpec) -> list[str]:
    """Anatomical brain phantom series (design study). Each grid sets pixel and slice spacing."""
    done: list[str] = []

    def geo(p: Phantom) -> dict:
        g = p.meta["grid"]
        return dict(pixel_mm=g.pixel_mm, slice_mm=g.slice_mm)

    p = brain.make_brain_dsc()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "DSC perf SNR50",
            150,
            "dynamic",
            times_s=p.meta["times"],
            te_ms=30.0,
            tr_ms=p.meta["tr"] * 1000,
            flip_deg=90.0,
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_dti()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "DTI 32dir",
            332,
            "bvalue",
            bvals=p.meta["bvals"],
            bvecs=p.meta["bvecs"],
            te_ms=80.0,
            tr_ms=6000.0,
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_ivim()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec("DWI IVIM DKI", 400, "bvalue", bvals=p.meta["bvals"], te_ms=80.0, tr_ms=5000.0, **geo(p)),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_dce_semiquant()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "T1 DCE semiquant",
            200,
            "dynamic",
            times_s=p.meta["times"],
            te_ms=2.0,
            tr_ms=5.0,
            flip_deg=15.0,
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_tofts()
    _write(
        p,
        out / p.name / "dicom_dce",
        study,
        SeriesSpec(
            "T1 DCE permeability",
            210,
            "dynamic",
            times_s=p.meta["times"],
            te_ms=2.0,
            tr_ms=p.meta["tr_ms"],
            flip_deg=p.meta["fa"],
            **geo(p),
        ),
    )
    for i, (fa, ref) in enumerate(p.meta["references"].items()):
        write_series(
            ref,
            out / p.name / f"dicom_vfa{int(fa)}",
            study,
            SeriesSpec(
                f"T1 FFE VFA {int(fa)}deg",
                211 + i,
                "none",
                te_ms=2.0,
                tr_ms=p.meta["tr_ms"],
                flip_deg=fa,
                **geo(p),
            ),
        )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_fmri()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "fMRI BOLD block",
            500,
            "dynamic",
            times_s=p.meta["times"],
            te_ms=30.0,
            tr_ms=p.meta["tr"] * 1000,
            flip_deg=80.0,
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    base, foll = brain.make_brain_flair_pair()
    fu_study = StudySpec(study_date="20260701", accession="PHANTOM0002", seed="neuromr-phantom-fu")
    for ph, st, num in ((base, study, 600), (foll, fu_study, 601)):
        _write(
            ph,
            out / ph.name / "dicom",
            st,
            SeriesSpec("3D FLAIR", num, "none", te_ms=120.0, tr_ms=4800.0, flip_deg=90.0, **geo(ph)),
        )
        _save_truth(ph, out / ph.name)
        done.append(ph.name)
    p = brain.make_brain_swi()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "SWI EPI",
            610,
            "none",
            te_ms=p.meta["te_ms"],
            tr_ms=p.meta["tr_ms"],
            flip_deg=90.0,
            image_type=("ORIGINAL", "PRIMARY", "M", "SWI"),
            extra={"ScanningSequence": "EP", "SequenceVariant": "SK"},
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    p = brain.make_brain_multi_echo()
    _write(
        p,
        out / p.name / "dicom",
        study,
        SeriesSpec(
            "Multi-echo GRE",
            620,
            "echo",
            echo_times_ms=p.meta["te_ms"],
            tr_ms=p.meta["tr_ms"],
            flip_deg=p.meta["flip_deg"],
            **geo(p),
        ),
    )
    _save_truth(p, out / p.name)
    done.append(p.name)
    return done


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "phantoms")
    ap.add_argument(
        "--only", type=str, default=None, help="comma list: dsc,dce,dti,ivim,fmri,mrs,flair,swi,echo,brain"
    )
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    for name in build(args.out, only):
        print(f"wrote {args.out / name}")


if __name__ == "__main__":
    main()
