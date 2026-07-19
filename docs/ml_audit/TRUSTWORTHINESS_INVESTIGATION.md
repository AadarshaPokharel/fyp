# Trustworthiness Investigation — Is the ~100% Accuracy Real?

**Date:** 2026-07-16
**Mandate:** Assume the near-100% accuracy is suspicious until proven otherwise. Do not improve the model — determine whether the reported performance can be trusted.
**Model under investigation:** `iot-airflow/ml/model.pkl` (Random Forest, 15 features, F2-optimized threshold 0.4288), trained on `data/events.csv` via `iot-airflow/dags/tasks/local_features.py`.

---

## Executive Summary

The near-100% accuracy is **mostly real, with one confirmed methodological flaw that does not turn out to explain it**, and one well-understood, non-leakage source of the small number of residual errors that do exist.

- **Confirmed flaw:** the production 80/20 chronological train/test split cuts through the middle of a single ~5-minute recording session (Session 17, 2026-05-31) that alone contains 45.3% of all collision examples in the dataset. This is genuine session leakage by definition.
- **But it doesn't explain the result:** isolating only the genuinely independent, fully-held-out sessions in the test set (recorded weeks later, zero overlap with training) still yields a perfect 100% accuracy/recall/precision on 3,379 rows. More decisively, **Leave-One-Session-Out cross-validation** (train on 21 sessions, test on 1 completely unseen session, repeated for all 22 sessions) gives a mean accuracy of 99.67% and mean recall of 99.5% — this is the most leakage-resistant validation possible for this data, and it still confirms near-perfect performance.
- **The small number of real errors that do occur are explained, not mysterious:** every error in the one session that underperforms (Session 2, 83% precision) is a false positive on a physically dangerous scenario (close + fast + approaching) where the ground-truth label happens to be "No Collision" only because of a `vehicleA`/`vehicleB` type flag the model was deliberately never given (a documented, intentional exclusion from an earlier leakage fix). The model is behaving safety-correctly; it disagrees with an artifact of the label, not with reality.
- **Adversarial validation** shows train and test are trivially distinguishable (AUC=0.999) — but the distinguishing features are `hour_of_day`/`day_of_week`, which is the expected, intentional signature of a chronological split across different calendar days, not a red flag.

**Bottom line:** this is genuine, near-total class separability given the available sensor features, not a validation artifact. The confidence should not be "the model is flawless" — it should be "the model has been tested about as rigorously as this single dataset allows, and passes; the remaining uncertainty is about generalizing beyond this one collection effort, not about hidden leakage within it."

---

## STEP 1 — Dataset Understanding

- **Samples:** 19,116 raw rows → 18,154 after Silver-layer cleaning (962 dropped for invalid distance/speed/risk_level/future timestamps).
- **Classes:** binary (`is_collision_event`), 94.1% No Collision / 5.9% Collision (15.8:1 imbalance).
- **Collection methodology:** not a continuous 24/7 feed — the data clusters into **22 distinct recording sessions** (inferred from gaps >5 minutes between consecutive readings) spanning 2026-03-21 to 2026-06-08, i.e. roughly 2.5 months, with large multi-day/multi-week gaps between most sessions (e.g. 2026-04-02 → 2026-05-19 is a 47-day gap). This is consistent with a student hardware prototype being tested in discrete sittings, not a deployed always-on system.
- **Are rows time-series?** Yes, within a session — the ~200ms Arduino loop interval (documented in the firmware description) means adjacent rows within a session are highly autocorrelated (same physical approach event sampled repeatedly).
- **Do multiple rows come from the same event?** Yes — a single vehicle approach is sampled many times as it closes distance, so "one collision scenario" is really dozens of consecutive rows, not one.
- **Do multiple rows come from the same session?** Yes, extremely unevenly: session sizes range from 26 rows to 3,845 rows; collision rates per session range from 0% to 41.4%.

## STEP 2 — Data Leakage Audit

| Leakage type | Found? | Detail |
|---|---|---|
| Target leakage (`both_close`, `risk_level`, `vehiclea`/`vehicleb`) | Fixed previously | Already removed from `FEATURES` by earlier work (documented in `ml_training.py`); re-verified none are in the current 15-feature list. |
| Feature leakage / future information | No | See Step 6 — every feature is computable from the current or one-prior sensor reading; no forward-looking windows exist anywhere in the pipeline. |
| Duplicate rows | No | Zero exact duplicate rows across the full 18,154-row dataset (checked directly). |
| Near-duplicate rows across train/test | Minor, ruled out as the cause | 15 of 3,631 test rows (0.4%) are near-duplicates of a training row by nearest-neighbor distance in standardized feature space; excluding them entirely still gives a perfect clean-holdout result. |
| Scaling/encoding/feature-selection before split | No | `local_features.py`/`ml_training.py` compute medians for imputation strictly from the training slice (`X_train_raw.median()`), applied to both splits — verified in code, this is correct practice. |
| **Session leakage** | **Yes — confirmed** | See Step 4. The chronological split cuts through Session 17 mid-recording. This is a real flaw in the current split methodology. |
| Cross-validation leakage | N/A | Production doesn't use CV for the final holdout; `TimeSeriesSplit` is used only inside `RandomizedSearchCV` for hyperparameter tuning, which is temporally correct. |
| Training-serving skew | Previously found and fixed | The `approachingA`/`approachingB` skew (15.6%/19.9% row disagreement) found and fixed in the prior audit — verified still fixed (`local_features.py` reuses `batch_prediction.engineer_features()` directly). |

## STEP 3 — Temporal Dependency

Confirmed sequential/session-structured data (Step 1). Production already avoids naive random splitting — it uses a chronological 80/20 split, and hyperparameter tuning uses `TimeSeriesSplit`. This audit adds a strictly stronger validation: **Leave-One-Session-Out** (Step 5), which is more rigorous than a single chronological split or a blocked/walk-forward split because it guarantees the held-out data was never adjacent-in-time to any training row from the same session.

## STEP 4 — Session Leakage (the central finding)

Sessions were inferred by clustering rows with gaps >5 minutes between consecutive timestamps (22 sessions found; see full table in the appendix data below). Checking which sessions the 80/20 chronological split assigns to train vs. test:

- **Train:** sessions 0–17 (partial)
- **Test:** sessions 17 (partial) – 21
- **Session appearing in BOTH:** session 17 only

Session 17 (2026-05-31, 18:59:41–19:05:04, 1,322 rows) has a **36.9% collision rate** — by far the richest in positive examples of any session — and alone accounts for **488 of the dataset's 1,078 total collision events (45.3%)**. The chronological split places 1,070 of its rows in train and 252 in test. This is genuine session leakage: test-set collision examples from this session are drawn from literally the same ~5-minute continuous physical test run as training examples, seconds apart.

**However:** isolating just the test rows from the 4 sessions with zero overlap (18, 19, 20, 21 — recorded on 2026-06-07 and 2026-06-08, one to eight days after session 17, with no shared session) still gives **100% accuracy, 100% recall, 100% precision, F1=1.0** on 3,379 rows containing 143 real collisions. The leaky slice is not carrying the result.

## STEP 5 — Group-Based Validation (Leave-One-Session-Out)

Ran true `LeaveOneGroupOut` cross-validation using session ID as the group — each of the 22 sessions held out completely (never seen in any form during that fold's training), the strongest leakage-resistant test available for this data.

| Result | Value |
|---|---|
| Sessions with perfect (100% acc/recall/precision/F1) held-out performance | 16 of 22 |
| Sessions with zero collision examples (trivially 100% accuracy, recall undefined) | 4 (sessions 3, 4, 11, 21) |
| Sessions with imperfect performance | 2 (sessions 0 and 2) |
| Mean accuracy across all 22 held-out sessions | 99.67% |
| Mean recall across sessions containing ≥1 collision | 99.5% |
| Mean F1 across sessions containing ≥1 collision | 99.2% |

Session 0 (29 rows, tiny sample): 1 missed collision out of 12 (91.7% recall) — most plausibly small-sample noise.
Session 2 (907 rows, 166 collisions): 96.3% accuracy, 100% recall, 83% precision — investigated fully in Step 12; not a validation flaw.

**This is the single strongest piece of evidence in this investigation.** A model relying on leakage or an artifact of the specific chronological split would not be expected to hold up this well when every session is, in turn, completely excluded from training.

## STEP 6 — Feature Timing Audit

| Feature | Prediction-time available? | Uses future info? | Leakage risk | Recommendation |
|---|---|---|---|---|
| `dista`, `distb` | Yes (instantaneous sensor read) | No | None | Keep |
| `distancediff`, `dist_ratio` | Yes (function of current `dista`/`distb` only) | No | None | Keep |
| `speeda`, `speedb` | Yes, but requires 1 prior reading (Δdistance/Δtime) | No — uses only the *previous* reading, never future | None (standard real-time streaming pattern) | Keep |
| `avgspeed` | Yes (mean of `speeda`/`speedb`) | No | None | Keep |
| `accelerationa`, `accelerationb` | Yes, requires 1 prior speed value (Δspeed/Δtime) | No | None | Keep |
| `accel_sum` | Yes (sum of the two) | No | None | Keep |
| `approachinga`, `approachingb` | Yes (raw Arduino flag, current reading) | No | None (fixed in prior audit — no longer re-derived from a different-timing formula) | Keep |
| `hour_of_day`, `day_of_week`, `is_rush_hour` | Yes (function of current timestamp) | No | None directly, but see Step 9 — these are what make train/test trivially distinguishable, an expected consequence of the chronological split, not a leakage risk to the model's predictions (near-zero permutation importance) | Keep, low priority |

No feature uses a rolling window, smoothing, or aggregation spanning more than one prior reading, and nothing spans the train/test boundary (medians for imputation are computed from training data only, verified in code). **No feature-timing leakage found.**

## STEP 7 — Feature Importance (cross-reference to prior audit)

Already computed in the prior audit (MDI, permutation importance, SHAP — `docs/ml_audit/feature_importance_comparison.csv`), re-confirmed here via the robustness battery (Step 8): `dista`/`distb` dominate; permutation importance for most temporal/acceleration/approach features is ≈0. No single feature reaches AUC=1.0 alone (max 0.964 for `dista`), ruling out a single trivial leaky predictor.

## STEP 8 — Robustness Testing

| Perturbation | Accuracy | Recall | Precision | F1 |
|---|---|---|---|---|
| Baseline (clean) | 100% | 100% | 100% | 100% |
| Gaussian sensor noise (σ=2.5cm/1.0) | 99.86% | 99.6% | 98.6% | 99.1% |
| Missing values, 5% cells (median-imputed) | 99.17% | 89.2% | 100% | 94.3% |
| Missing values, 20% cells (median-imputed) | 96.17% | 50.0% | 100% | 66.7% |
| 10% random corruption on `dista`/`distb` | 98.73% | 83.5% | 100% | 91.0% |
| 2% extreme outlier spikes (9999) | 99.81% | 97.5% | 100% | 98.7% |
| **Unit conversion error (distance ×2.54, e.g. cm/inch mixup)** | 97.47% | **66.9%** | 100% | 80.2% |
| Systematic sensor drift (+10% distance bias) | 99.86% | 98.2% | 100% | 99.1% |
| Zero out `dista` (dead sensor channel) | 92.40% | **0.7%** | 100% | 1.4% |
| Zero out `distb` (dead sensor channel) | 92.34% | **0.0%** | 0% | 0.0% |
| Zero out `avgspeed` | 99.06% | 87.8% | 100% | 93.5% |
| Zero out `approachinga` / `approachingb` / `accel_sum` | 100% | 100% | 100% | 100% |

**Degradation is genuine and directionally sensible** — this is itself evidence against hidden leakage (a leaked feature would be immune to noise on unrelated columns; the real feature the model relies on is exactly the one that, when corrupted, breaks it). Two concrete operational risks surfaced here that are new findings, not previously flagged:

- **No sensor redundancy:** losing either single distance sensor collapses recall to ~0%. There is no fallback behavior for a disconnected/dead ultrasonic sensor.
- **No input sanity-checking:** a unit-conversion mixup (a real, plausible field-deployment mistake) silently drops recall to 66.9% with nothing in the pipeline to flag that sensor readings look implausible.

## STEP 9 — Adversarial Validation

Trained a classifier to distinguish training rows from test rows using the 15-feature set. 5-fold CV ROC-AUC = **0.999** — train and test are trivially separable. Top distinguishing features: `hour_of_day` (28%), `dista` (17%), `distb` (14%), `day_of_week` (13%).

**Interpretation:** this is expected, not alarming. The split is intentionally chronological across different calendar days — of course a classifier can tell train from test using the time of day/week, since sessions happened on genuinely different days. Combined with the LOGO result (Step 5), which shows the model generalizes well *despite* this real distribution shift across sessions, the high adversarial AUC corroborates that train and test are genuinely independent recording sessions (not an artificially homogeneous resampling), rather than indicating a hidden problem.

## STEP 10 — Baseline Comparison (cross-reference to prior audit)

Already completed in the prior audit (`docs/ml_audit/model_comparison.json`): Random Forest, Extra Trees, Gradient Boosting, XGBoost, and LightGBM all scored F1 ≥ 0.95 on the same time-based split; Logistic Regression, Naive Bayes, KNN, SVM, and an MLP neural net all scored meaningfully lower (F1 0.83–0.90). Tree ensembles are the right family for this problem; this is not an artifact of Random Forest specifically.

## STEP 11 — Calibration

| Metric | Value |
|---|---|
| Brier score (noisy test) | 0.00367 |
| Expected Calibration Error (ECE, 15 bins) | 0.0139 |
| Maximum Calibration Error (MCE) | 0.5555 (in a 4-sample bin near the 0.40-0.47 probability range) |

The bulk of predictions sit in two extreme, well-calibrated clusters: 3,264 of 3,631 predictions cluster at ≈0.004 probability with an observed collision rate of 0.000, and 208 cluster at ≈0.989 with an observed rate of 1.000. The high MCE occurs in a sparse bin with only 4 samples — a small-sample artifact of the calibration curve, not a systematic miscalibration; ECE (which weights by bin size) is low. **Verdict: probabilities are trustworthy in aggregate; the few borderline predictions near the decision threshold are the least reliable, which is normal for any classifier.**

## STEP 12 — Error Analysis (deep dive on Session 2)

Session 2's 34 errors (all false positives) were traced to their raw `vehicleA`/`vehicleB` values: **100% of them have a combination other than (1,1)** — i.e. not both "type-1" vehicles. Correctly-classified close-range rows in the same session are overwhelmingly (1,1). Since `is_collision_event = vehicleA AND vehicleB AND avgSpeed > 2.0`, and `vehicleA`/`vehicleB` were deliberately excluded from the feature set (a prior, already-documented leakage fix — "only type-1 vehicles appear in collision scenarios... a dataset collection artifact, not a real physical signal"), the model cannot see the one variable that flips these labels. Physically, these scenarios (close distance, high speed, both approaching) are indistinguishable from true collisions using any sensor the model has access to. **This is the correct, safety-conscious behavior of a model that was deliberately not given a leaky, physically-irrelevant shortcut — not a flaw.**

## STEP 13 — Dataset Difficulty / Is 100% Plausible?

The label (`vehicleA AND vehicleB AND avgSpeed > 2.0`) is a deterministic rule, not a noisy human judgment — there is no irreducible annotation noise (no "Bayes error floor" from subjective labeling, unlike e.g. medical diagnosis or sentiment labels). Given that, and given the physical reality that `dista`/`distb` (proximity) and `avgspeed` (closing speed) are strongly, near-monotonically related to genuine collision risk, near-perfect separability is theoretically plausible **for scenarios similar to what was tested** — this is a controlled hardware-prototype test dataset (staged close/fast vs. far/slow scenarios), not naturally messy, ambiguous real-world traffic. The residual difficulty that does exist (Session 2) comes entirely from the vehicle-type artifact described in Step 12, not from any genuine ambiguity in the distance/speed signal itself.

## STEP 14 — External Validation

**The dataset contains data from one continuous project effort (22 sessions, one physical hardware rig, one location, over 2.5 months) — it does not contain data from multiple independently-deployed physical units, multiple road locations, multiple drivers/operators, or varied weather conditions.** Despite spanning many sessions and days, this is still fundamentally one prototype's test history, not independent field validation.

**Recommendation:** before treating these numbers as representative of real-world deployment, collect data from at least 2–3 additional physically distinct installations (different curve geometry, different weather, ideally a different specific hardware unit to catch sensor-to-sensor calibration variance) and re-run this same Leave-One-Session-Out (or better, leave-one-installation-out) methodology against that new data.

## STEP 15 — Production Readiness

**Rating: Medium.**

Justification: the modeling and validation methodology, once corrected for the session-boundary issue in principle (LOGO shows it doesn't materially change the answer), is sound and the near-100% result holds up under the most rigorous test available with this data. What holds this back from "High": (a) single-installation data only (Step 14), (b) two concrete, unaddressed operational fragilities found in Step 8 — no sensor-redundancy fallback and no input-plausibility validation — that would matter more in the field than in this offline evaluation, and (c) the model has literally never scored on data from a second physical rig or location.

## STEP 16 — Final Verdict

### ISSUE ID: TRUST-001
- **Severity:** Major
- **Category:** Data leakage / validation methodology
- **Description:** The production 80/20 chronological split cuts through the middle of Session 17, a single recording session that contains 45.3% of all collision examples in the dataset.
- **Evidence:** Session/timestamp-gap clustering (22 sessions found); session 17 spans the split boundary (1,070 rows in train, 252 in test).
- **Root Cause:** An 80/20 index-based split on chronologically sorted data does not respect session/recording-run boundaries.
- **Files Affected:** `iot-airflow/dags/tasks/ml_training.py` (the `split_idx = int(len(df) * 0.8)` logic)
- **Impact on Model:** Confirmed present, but **empirically shown not to be the cause of the near-100% result** — LOGO validation (which removes this leakage entirely) reproduces essentially the same performance (99.67% mean accuracy).
- **Recommended Fix:** Change the split to respect session boundaries — e.g., assign whole sessions to train or test (a session-level, not row-level, 80/20 split).
- **Implementation:** Not implemented in this pass per instructions ("do not modify the model unless a real problem is found" — this is a methodology flaw worth fixing, but it is not inflating the reported numbers, so it's recorded here as a recommendation rather than an emergency fix).
- **Validation After Fix:** Would be confirmed by re-running the existing LOGO script and comparing to a session-respecting chronological split — already effectively done in this investigation.
- **Status:** [ ] Recommended, not yet implemented (does not require urgent action given LOGO already validates the alternative)

### ISSUE ID: TRUST-002
- **Severity:** Minor (not leakage — label-definition artifact)
- **Category:** Error analysis / ground truth definition
- **Description:** Session 2 shows 34 false positives, all attributable to `vehicleA`/`vehicleB` combinations other than (1,1) in physically dangerous (close + fast) scenarios.
- **Evidence:** Direct inspection of raw `vehiclea`/`vehicleb` values on every error row in Session 2 vs. correctly-classified same-session rows.
- **Root Cause:** The label depends on a vehicle-type flag that is a data-collection-protocol artifact, already correctly excluded from the model's features by prior work.
- **Files Affected:** None — this is a property of the original label/data collection design (`iot-airflow/dags/tasks/snowflake_silver.py`'s label rule), not a bug in current code.
- **Impact on Model:** Small, localized precision loss in one specific session; the model's behavior (flagging physical danger regardless of vehicle type) is arguably safer than the label.
- **Recommended Fix:** None required for the model. If pursued, would mean revisiting the label definition itself (e.g., should "vehicle type" ever gate a real collision-risk warning?) — a product/labeling decision, not an ML fix.
- **Status:** [x] Investigated and explained; no fix needed

### ISSUE ID: TRUST-003
- **Severity:** Major
- **Category:** Production robustness
- **Description:** No fallback behavior exists for a dead/disconnected ultrasonic sensor; losing either `dista` or `distb` collapses recall to ~0-1%.
- **Evidence:** Robustness battery, Step 8.
- **Root Cause:** No sensor-health monitoring or redundancy in the current hardware/software design; missing values are imputed with the training-set median, which biases toward "safe" — the worst possible failure mode for a system that exists to warn about danger.
- **Files Affected:** `backend/app/routes/predict.py`, `iot-airflow/dags/tasks/batch_prediction.py` (wherever missing/implausible sensor values are currently silently imputed)
- **Impact on Model:** Not a modeling flaw, but a real field-deployment risk: a failed sensor would silently produce false "SAFE" readings rather than an alert or a fail-safe HIGH-risk default.
- **Recommended Fix:** Detect implausible/missing sensor readings explicitly (e.g., sensor timeout, reading stuck at 0 or max range) and fail toward a conservative default (MEDIUM/HIGH alert or an explicit "sensor fault" state) rather than silent median imputation.
- **Status:** [ ] Recommended, not implemented in this pass (flagged per the "do not modify the model unless a real problem is found" instruction — this is a real problem, but it's a systems/firmware-and-API design change, not a model-training fix, and deserves its own scoped implementation)

### ISSUE ID: TRUST-004
- **Severity:** Minor
- **Category:** Production robustness / input validation
- **Description:** A unit-conversion error (e.g., cm/inch mixup) silently drops recall to 66.9% with no validation catching it.
- **Evidence:** Robustness battery, Step 8.
- **Root Cause:** No range/plausibility validation on incoming sensor values beyond the existing HC-SR04 range check.
- **Files Affected:** `backend/app/routes/predict.py` (`PredictRequest` Pydantic schema already has some `ge=0` bounds but nothing that would catch a systematic scale error)
- **Impact on Model:** Field-deployment risk only; does not affect the reported offline metrics.
- **Recommended Fix:** Add a plausibility check comparing incoming readings against expected sensor range/units at ingestion time.
- **Status:** [ ] Recommended, not implemented in this pass

---

## Scores

| Dimension | Score | Basis |
|---|---|---|
| **Overall Trustworthiness Score** | **82/100** | Rigorously re-tested with LOGO, adversarial validation, and robustness stress tests; the one real leakage flaw found (TRUST-001) does not change the empirical result. Points withheld for single-installation data and the two unaddressed field-robustness gaps. |
| Data Quality Score | 85/100 | Clean, well-profiled, zero duplicates; session imbalance (one session holds 45% of positives) is a real characteristic worth documenting, not a defect. |
| Validation Quality Score | 80/100 | Chronological split was already correct in spirit; LOGO (added in this investigation) is the rigorous confirmation that should become the standard ongoing validation method, not just an audit exercise. |
| Leakage Risk Score (higher = lower risk) | 78/100 | One confirmed session-boundary leak (TRUST-001), empirically shown not to be driving the result; no feature-level or temporal leakage found. |
| Generalization Score | 65/100 | Excellent generalization *within* this one hardware/location/timeframe (proven via LOGO); unknown and untested beyond it (Step 14). |
| Production Readiness Score | 60/100 (Medium) | Sound model, but real, unaddressed field-robustness gaps (TRUST-003, TRUST-004) that matter more outside a clean offline evaluation. |

## Final Recommendation

**Trust the number, but trust it precisely for what it is: near-perfect separability on one prototype's test history, validated as genuinely non-leaked via Leave-One-Session-Out cross-validation — not yet validated as representative of a different install, location, or set of weather/traffic conditions.** Before further claims of production-grade accuracy: (1) fix the session-respecting split for future retraining (TRUST-001), (2) add sensor-fault fail-safe behavior (TRUST-003), (3) add input plausibility validation (TRUST-004), and (4) collect data from at least one additional independent installation and re-validate with the same LOGO methodology used here.
