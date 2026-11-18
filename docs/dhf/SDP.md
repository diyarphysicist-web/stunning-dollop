# Software development plan

## Scope
NeuroMR-PRO, a Windows workstation application for quantitative neuro-MRI post-processing (brief `docs/PROMPT.md`). Safety class **B** (IEC 62304): a software failure could contribute to a hazardous situation (for example wrong perfusion values or wrong-side display) that could lead to non-serious injury, with clinician review as an external risk control.

## Life-cycle model
Incremental, in the phases of brief §10 (Phase 2 split into 2a/2b/2c). Each phase ends with a gate: full test suite, app run, screenshots compared with the locked design, commit and push, phase report, `CLAUDE.md` handoff.

## Activities and outputs
| Activity | Output | Where |
|---|---|---|
| Requirements | Stable IDs, reviewed at each gate | `docs/spec/FUNCTIONAL_SPEC.md` |
| Architecture | Process and module boundaries, IPC contract | `docs/dhf/ARCHITECTURE.md`, `packages/contracts` |
| Detailed design | Algorithm equations, defaults, gates | `docs/spec/ALGORITHMS.md` |
| Implementation | Pure-function algorithms, typed contracts | `engine/`, `packages/` |
| Unit verification | pytest, Vitest; requirement ID in each test name | CI |
| Integration / system verification | Phantom gates (brief §11), Playwright end-to-end | CI and release |
| Risk management | Hazards → controls → requirement IDs → tests | `docs/dhf/RISK.md` |
| Configuration management | Git, conventional commits, signed tags at release | GitHub |
| Problem resolution | Issues labelled `anomaly`, triaged at each gate | GitHub, `ANOMALIES.md` |
| SOUP management | Version, licence, purpose, known anomalies | `docs/dhf/SOUP.md` |

## Standards and tools
Python 3.12 (ruff, pytest), TypeScript 5 strict (ESLint, Vitest), pnpm workspaces, uv. CI on GitHub Actions; Windows packaging jobs on `windows-latest`.

## Acceptance
A requirement is verified when a test referencing its ID passes in CI. CI fails if a requirement delivered in a completed phase has no referencing test (`scripts/trace.py --phase N`).
