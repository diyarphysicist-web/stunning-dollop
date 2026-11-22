# NeuroMR-PRO — Algorithms

Status: Phase 0 baseline (v0.1). Each algorithm is a pure function in `engine/neuromr_engine/algorithms/<area>/` with unit tests and a phantom gate (`engine/tests/`). Requirement IDs refer to `FUNCTIONAL_SPEC.md`. Values marked *(NMR default)* are NeuroMR-PRO choices; values marked *(provisional)* are confirmed or tightened when the owning phase runs its phantom study, and the change is recorded here with the evidence.

Notation: t time [s]; S(t) signal; S₀ baseline signal; Δt temporal resolution [s]; TE echo time [s]; b b-value [s/mm²].

---

## 0. Shared

### 0.1 Baseline and arrival
- Baseline window: dynamics before arrival, excluding skipped dynamics (DSC-003). S₀ = mean over the window.
- Arrival T0 (DSC): first dynamic where ΔR2* exceeds `baseline_mean + 3·baseline_SD` for two consecutive dynamics; sub-dynamic refinement by linear interpolation of the crossing *(NMR default)*.
- Arrival T0 (DCE, DCE-005): first time S(t) ≥ 1.2·S₀ (20 % rise), linearly interpolated between dynamics.

### 0.2 Smoothing (GEN-060/061)
- Spatial: separable uniform (box) filter of width k ∈ {1, 3, 5, 7} in-plane, `mode='nearest'`, applied to the source before fitting and to the maps for display.
- Temporal: uniform filter of width w ∈ {1, 3, 5, 7} along dynamics, `mode='nearest'`.

### 0.3 Measurement types (GEN-110)
- Region parameters: average the ROI voxel curves, then run the per-voxel algorithm once on the mean curve.
- Mean voxel parameters: mean of the voxel map values inside the ROI, ignoring masked and failed-fit voxels (count reported).

### 0.4 Windowing ROI (GEN-120)
Window = [P2, P98] of map values inside the ROI.

---

## 1. DCE / T1 semi-quantitative (DCE-005/006)

| Parameter | Definition | Unit |
|---|---|---|
| RELENH(D) | (S(D) / S(D_ref) − 1) × 100 | % |
| S0 | mean S over pre-arrival dynamics | a.u. |
| S1 | max S over all dynamics | a.u. |
| MAXENH | S1 − S0 | a.u. |
| MAXRELENH | max_D RELENH(D) | % |
| T0 | §0.1 DCE rule | s |
| TTP | t at S1, measured from the first dynamic | s |
| AREACURV | Σ_D S(D)·Δt_D (trapezoid) over all dynamics | a.u.·s |

**≤ 8 dynamics** (discrete): WASHIN = max over D in (T0, T1] of (S(D) − S(D−1)) / (t_D − t_{D−1}); WASHOUT = min over D in (T1, end] of the same slope (negative for wash-out); BREVENH = t(max wash-out slope) − t(max wash-in slope).

**> 8 dynamics** (bilinear): fit a continuous piecewise-linear model with three segments — flat baseline until T0, wash-in line until break t_b, wash-out line after — by least squares over t_b on a 0.1·Δt grid. WASHIN and WASHOUT are the slopes of the second and third segments. BREVENH = time between the midpoints of the wash-in and wash-out segments.

Gate (DCE-007): phantom of piecewise curves with known parameters, 5 % Gaussian noise relative to S1, 1000 voxels per class → mean bias < 5 % per parameter, 95th-percentile error < 10 %.

References: Kuhl, Radiology 2007;244:356–378. Jackson et al., PLoS One 2014;9:e90300.

---

## 2. DSC perfusion (DSC-010…032)

### 2.1 Signal to concentration
ΔR2*(t) = −(1/TE)·ln(S(t)/S₀). Voxels with S(t) ≤ 0 are clipped to a floor of 1 % of S₀ before the log.

### 2.2 Gamma variate (DSC-011)
Model on the first pass: C(t) = K·(t − T0)^α·exp(−(t − T0)/β) for t > T0, 0 otherwise. Fit window: from T0 to the first dynamic after the peak where C drops below 30 % of the peak (excludes recirculation). Nonlinear least squares (Levenberg–Marquardt) on (K, T0, α, β) with α ∈ (0.1, 20), β ∈ (0.05, 20) s, initialised from the log-linearised form.

- relCBV = ∫C dt = K·β^(α+1)·Γ(α+1) (analytic).
- MTT = ∫(t − T0)·C dt / ∫C dt = β·(α + 1) (analytic first moment from arrival).
- TTP = T0 + α·β; relCBF = relCBV / MTT.

References: Thompson et al., Circ Res 1964;14:502–515. Davenport, J Nucl Med 1983;24:945–948. Benner et al., Magn Reson Imaging 1997;15:307–317. Belliveau et al., Magn Reson Med 1990;14:538–546.

### 2.3 Model-free (DSC-012)
Front baseline as §0.1; tail baseline = mean of ΔR2* after recirculation (last 20 % of dynamics); bolus window = [T0, T_end] where T_end is the first post-peak dynamic where ΔR2* returns within 3·SD of the tail baseline. Integrals by trapezoid over the window after subtracting a linear baseline joining front and tail levels.
- relCBV = ∫C dt; MTT = ∫(t − T0)·C dt / ∫C dt; relCBF = relCBV / MTT; TTP at max C.

Reference: Meyer-Bäse et al., IEEE Trans Inf Technol Biomed 2007;11:563–573 (model-free time-series analysis).

### 2.4 Leakage correction (DSC-014/015)
Reference curve R̄(t) = mean ΔR2* of non-enhancing voxels: inside mask, relCBV in the 10th–90th percentile, and post-bolus tail ΔR2* within ±1 SD of the whole-brain tail mean *(NMR default)*. Per voxel solve by linear least squares:

ΔR2*(t) = K1·R̄(t) − K2·∫₀ᵗ R̄(τ) dτ

- relCBVcorr = ∫ΔR2* dt + K2·∫₀^T ∫₀ᵗ R̄(τ) dτ dt; relCBVuncorr = ∫ΔR2* dt.
- K2 reported in min⁻¹ (×60 from s⁻¹). Sign convention: K2 > 0 under T1 dominance, K2 < 0 under T2* dominance.
- R² = coefficient of determination of the fit; reference mask exported as a binary map.

Reference: Boxerman, Schmainda, Weisskoff, AJNR 2006;27:859–867.

### 2.5 Deconvolution, oSVD (DSC-013)
- AIF: mean ΔR2* of the selected voxels in the 7×7 box. Tissue and AIF are zero-padded to length N = 2·L.
- Block-circulant convolution matrix A built from the AIF with Δt scaling (simple rectangular rule) (Wu et al. 2003).
- SVD of A; truncation threshold P_SVD chosen per voxel as the smallest value in {0.01…0.40, step 0.01} for which the residue function oscillation index O = (1/(N·max r))·Σ|r_k − 2r_{k−1} + r_{k−2}| ≤ 0.095 *(Wu 2003 value)*.
- relCBF = max r(t) × (ρ⁻¹·k_H scaling) × 60 × 100 → ml/100 g/min, with brain density ρ = 1.04 g/ml and hematocrit correction k_H = (1 − 0.45)/(1 − 0.25) *(NMR default, documented in reports)*. relCBV = ∫C dt / ∫AIF dt × (k_H/ρ) × 100 → ml/100 g. MTT = relCBV / relCBF (central volume theorem, minutes → seconds).
- Tmax/Delay = argmax_t r(t) [s], resolution Δt (DSC-013, Calamante 2010).

**AIF quality check (DSC-024):** flag when AIF peak time > tissue median TTP − Δt, FWHM > 8 s, or peak ΔR2* < 3× median tissue peak.

**oSVD CBF tolerance curve (DSC-032)** *(provisional)*: on the noise-free-AIF phantom with SNR 50 and Δt = 2.1 s, ratio CBF_est/CBF_true must lie within:

| True MTT [s] | 2 | 3 | 4 | 6 | 8 | 12 |
|---|---|---|---|---|---|---|
| min ratio | 0.55 | 0.65 | 0.75 | 0.80 | 0.85 | 0.85 |
| max ratio | 1.10 | 1.10 | 1.10 | 1.10 | 1.10 | 1.10 |

Rationale: truncated SVD systematically underestimates flow when MTT is short relative to Δt (Østergaard et al., MRM 1996;36:715–725; Wu et al. 2003). Additionally, mean estimated CBF must be strictly increasing across the phantom's CBF levels at each MTT.

References: Wu et al., Magn Reson Med 2003;50:164–174. Østergaard et al., Magn Reson Med 1996;36:715–725. Calamante et al., Stroke 2010;41:1169–1174.

### 2.6 Gates (DSC-031)
Phantom: gamma-variate tissue curves from known CBV/CBF/MTT/T0 convolved with an arterial gamma variate, Rician noise at SNR 50, Δt = 2.1 s, TE = 30 ms. Gamma/model-free/leakage: |mean bias| ≤ 10 % for relCBV and relCBF (relative measures normalised to the phantom's reference tissue); MTT, TTP, T0 within Δt/2 = 1.05 s. Leakage phantom with known K1, K2: |bias K1| ≤ 0.11, |bias K2| ≤ 1 × 10⁻³ min⁻¹.

---

## 3. Diffusion–perfusion mismatch (MM-002…008)

- Registration: rigid (6 DOF), perfusion dynamic 1 → diffusion b0, ANTs local-correlation (CC) metric radius 4, multi-resolution 4/2/1 *(NMR default)*.
- Automatic segmentation: from each seed, 3D 26-connected region growing over voxels satisfying the threshold (ADC < 620 × 10⁻⁶ mm²/s; Tmax > 6 s), within the brain mask; morphological opening with 1-voxel ball to drop bridges. Exclusion ROIs subtract voxels.
- Volumes: voxel count × voxel volume [ml]. Mismatch volume = V_perf − V_core (core = diffusion region ∩ brain); mismatch ratio = (V_perf − V_core) / V_perf × 100 %. Penumbra = perfusion region \ diffusion region.

Threshold sources: ADC < 620 × 10⁻⁶ mm²/s and Tmax > 6 s are the thresholds widely used in automated stroke imaging (Albers et al., N Engl J Med 2018;378:708–718; Lansberg et al., Lancet Neurol 2012;11:860–867). Reports state they are configurable defaults.

---

## 4. Permeability, Extended Tofts (PERM-001…011)

### 4.1 Baseline T1 by variable flip angle
SPGR: S(α) = M₀·sin α·(1 − E₁)/(1 − E₁·cos α), E₁ = exp(−TR/T1). Linearised: S/sin α = E₁·(S/tan α) + M₀(1 − E₁); fit slope E₁ over the reference flip angles (Wang et al. 1987; Fram et al. 1987). T1 = −TR/ln E₁. Clip T1 to [100, 6000] ms.

### 4.2 Signal to concentration
R1(t) from the SPGR equation with known T1₀, TR and DCE flip angle: E₁(t) = (S(t)/S_b·A − 1)/(S(t)/S_b·A·cos α − 1) where A = (1 − E₁₀)/(1 − E₁₀·cos α) and S_b is the DCE baseline. C(t) = (R1(t) − R1₀)/r₁.

### 4.3 AIF
- Population (Weinmann bi-exponential plasma curve): C_p(t) = D·Σ_{i=1,2} a_i·exp(−m_i·t) for t ≥ t₀ with D dose [mmol/kg], a₁ = 3.99 kg/l, a₂ = 4.78 kg/l, m₁ = 0.144 min⁻¹, m₂ = 0.0111 min⁻¹ (Tofts & Kermode 1991). Injection-duration classes convolve this with a boxcar of 3 s (short), 7.5 s (medium) or 15 s (long) *(NMR default)*.
- Manual: mean of selected voxel concentrations, converted to plasma via C_p = C_b/(1 − Hct), with blood T1₀ from the field-strength table (PERM-007; Lin et al., MAGMA 2012).

### 4.4 Model
C_t(t) = v_p·C_p(t) + K^trans·∫₀ᵗ C_p(τ)·exp(−k_ep·(t − τ)) dτ, v_e = K^trans/k_ep. Fit (K^trans, k_ep, v_p, delay) per voxel by bounded nonlinear least squares (K^trans ∈ [0, 5] min⁻¹, k_ep ∈ [0, 10] min⁻¹, v_p ∈ [0, 1], delay ∈ [−5, 15] s, grid search on delay then LM). iAUC = ∫₀^60 s C_t dt. Delay map = fitted delay.

References: Tofts et al., J Magn Reson Imaging 1999;10:223–232. Tofts & Kermode, Magn Reson Med 1991;17:357–367. Tofts (ed.), *Quantitative MRI of the Brain*, ch. 10.

Gate (PERM-011): phantom with known K^trans, v_e, v_p, population AIF, SNR 50 → |mean bias| ≤ 10 % for K^trans and v_e; r² ≥ 0.94.

---

## 5. Diffusion and tensor (DIF-005…010)

- Directional ADC_d = ln(S₀/S_d)/b for each gradient d (two-point) or log-linear least squares across selected b-values.
- ADC-iso = mean of the three orthogonal (or all available) directional ADCs; with DTI, ADC-iso = MD = trace(D)/3.
- eADC = exp(−b_max·ADC); eADC-iso likewise.
- DWI-iso = S₀·exp(−b_max·ADC-iso).
- Tensor: weighted linear least squares on ln S (DIPY `TensorModel`, fit_method='WLS'). λ₁ ≥ λ₂ ≥ λ₃.
- FA = √(3/2)·√Σ(λ_i − MD)² / √Σλ_i²; AD = λ₁; RD = (λ₂ + λ₃)/2; RA = √Σ(λ_i − MD)² / (√3·MD).
- FA direction: |e₁| components mapped to (R, G, B) = (|x| RL, |y| AP, |z| SI) × FA.

Gate (DIF-010): synthetic tensors, 6–64 directions, b = 0/1000 → noise-free error ≤ 2 %; SNR 30 mean bias ≤ 5 %.

References: Basser & Pierpaoli, J Magn Reson B 1996;111:209–219. Garyfallidis et al. (DIPY), Front Neuroinform 2014;8:8.

---

## 6. Tractography (TRK-006…013)

- Deterministic streamline tracking along the principal eigenvector (DIPY `EuDX`/`LocalTracking` with `DeterministicMaximumDirectionGetter` on the tensor peaks).
- Defaults *(NMR default)*: stop when FA < 0.20, turning angle > 45° per step, discard fibers < 10 mm; step 0.5 × smallest voxel size; 1 seed per ROI voxel (high-density single-ROI: 2×2×2 seeds per voxel); trilinear tensor interpolation; maximum length 250 mm.
- ROI logic: keep streamlines that intersect every AND ROI and no NOT ROI.
- Statistics: count, mean length; FA and ADC sampled along each streamline by trilinear interpolation, then mean ± SD over all points.

Gate: synthetic crossing-free bundle phantom → ≥ 95 % of seeded streamlines follow the ground-truth path within 1 voxel; no streamlines leave a straight bundle when FA outside is 0.05.

References: Mori et al., Ann Neurol 1999;45:265–269. Basser et al., Magn Reson Med 2000;44:625–632. ASFNR guidance on clinical DTI (2012) for the limitation notice.

---

## 7. Brain Function, GLM (FMRI-006…015)

- Pre-processing: rigid motion correction to the middle dynamic (6 parameters reported for the quality graph); optional Gaussian smoothing FWHM = slider value; brain mask by intensity (nilearn `compute_epi_mask`).
- Design: block or event regressors convolved with the SPM canonical HRF (nilearn `make_first_level_design_matrix`, hrf_model='spm'), cosine drift high-pass 1/128 Hz, optional 6 motion regressors.
- Fit: OLS with AR(1) prewhitening (nilearn `FirstLevelModel`, noise_model='ar1'); T map per task contrast.
- Resting state: seed time course = mean of ROI voxels; T map from correlation with the seed regressor in the same GLM.
- Cluster filter: 26-connected clusters smaller than the size control are hidden.

Gate (FMRI-015): block phantom with known blobs, SNR 100 → every blob detected at T for p < 0.001 uncorrected; no false cluster > 10 voxels.

References: Friston et al., Hum Brain Mapp 1994;2:189–210. Abraham et al. (nilearn), Front Neuroinform 2014;8:14.

---

## 8. Spectroscopy (MRS-006…014)

- Time-domain processing: water-reference eddy-current correction when present; apodisation 2 Hz exponential *(NMR default)*; zero-fill ×2; FFT.
- Zero-order auto phase: maximise ∫Re(S) over the 1.8–4.2 ppm band subject to minimal negative area (ACME-style entropy minimisation as fallback).
- Fitting: linear-combination of Lorentzian–Gaussian (Voigt) basis lines for each metabolite (chemical shifts and multiplet patterns from literature) plus a smooth baseline (cubic B-spline, knot spacing 0.5 ppm), non-negative least squares on amplitudes with nonlinear refinement of shifts (±0.03 ppm) and widths.
- Area = fitted amplitude × lineshape integral; ratio = area_i / area_ref.
- FWHM [ppm] = Δf_half / f_res × 10⁶; SNR per MRS-012; quality per MRS-010.

Gate (MRS-014): simulated spectra with known amplitudes, widths and noise → ratios Cho/Cr, NAA/Cr, Cho/NAA within 5 %.

References: Provencher, Magn Reson Med 1993;30:672–679 (LCModel principle). Near et al., NMR Biomed 2021;34:e4257 (MRS processing consensus). Wilson et al., Magn Reson Med 2019;82:527–550 (MRS fitting consensus).

---

## 9. Longitudinal (LBA-010…043)

- Inter-study registration: rigid then optional affine, Mattes MI, multi-resolution (SimpleITK), brain-masked.
- Change map: N4 bias-field correction (Tustison 2010) on both volumes → registration → histogram matching of follow-up to baseline within the brain mask → difference D = follow-up − baseline → robust range from 2nd–98th percentile of |D| → display threshold = 10 % of that range; overlay alpha = clip((|D| − thr)/(range − thr), 0, 1).
- FLAIR*: register SWI/EPI to FLAIR (rigid, same session), normalise each to [0, 1] by the 99th percentile within brain, product voxelwise (Sati et al., Radiology 2012;265:926–932). Phantom: `swi_epi` (T2*-weighted EPI on the baseline FLAIR grid and lesions; hypointense central veins in lesions 1 and 3 plus one vein outside any lesion; displaced by a known (0, 1.5, −1) voxel shift).
- Seed-point segmentation: from the clicked voxel, threshold = intensity midpoint between local lesion core (median in 3×3×3) and surrounding ring (median at the sphere boundary), adjustable by `Shift`+wheel; connected component inside the limiting sphere; hole filling.
- Volume = voxel count × voxel volume [ml].

Gate (LBA-043): FLAIR phantom pairs with lesions grown/shrunk by known volumes → |volume change error| ≤ 5 % for lesions ≥ 10 voxels.

References: Tustison et al., IEEE Trans Med Imaging 2010;29:1310–1320. Sati et al. 2012.

---

## 10. Advanced diffusion (ADV-001…012)

Models (S₀ fitted unless noted; b in s/mm², D and D* in mm²/s):
- Mono-exponential: S = S₀·exp(−b·D).
- Simplified IVIM: S = S₀·(1 − f)·exp(−b·D) for b ≥ thr_IVIM, with S(0) measured; D from log-linear fit above threshold, f = 1 − S₀'/S(0) where S₀' is the intercept.
- Bi-exponential: S = S₀·[(1 − f)·exp(−b·D) + f·exp(−b·D*)]; segmented fit (D, f from high b, then D* from all b), bounds D* ∈ [3D, 0.1].
- Kurtosis (mono): S = S₀·exp(−b·D + b²·D²·K/6), K ∈ [0, 3].
- Kurtosis + simplified IVIM: kurtosis model above thr_IVIM with f from the b = 0 intercept.
- cDWI(b_c) = model prediction at b_c.
- Goodness of fit = NRMSE = RMS(S − Ŝ)/mean(S) × 100 %.

Gates (ADV-012) *(provisional, SNR 100 phantom)*: D within 5 %; f within 0.02 absolute; D* within 30 %; K within 10 %; fitted-signal NRMSE ≤ 10 % (mono), 8 % (simplified IVIM), 7 % (bi-exp), 1 % (kurtosis mono), 3 % (kurtosis + IVIM).

References: Le Bihan et al., Radiology 1988;168:497–505. Jensen et al., Magn Reson Med 2005;53:1432–1440. Koh et al., AJR 2011;196:1351–1361.

---

## 11. Subtraction and echo accumulation

- Subtraction (SUB-001): float32 voxelwise with the formulas in the spec; divisions with |denominator| < ε (1e-6 × max |R|) return 0 and are counted. Output rescaled to the integer range with stored slope/intercept.
- Echo accumulation (ECHO-002): Σ_{e∈range} S_e in float32, rescaled likewise. Phantom: `multi_echo_gre` (S0 · exp(−TE/T2*), TE 5/10/15/20 ms, T2* 60 ms tissue and 30 ms lesions, SNR 100; truth holds the noise-free sum over all echoes).
