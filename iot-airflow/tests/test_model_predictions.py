"""
Model smoke tests for the deployed collision-risk model (iot-airflow/ml/model.pkl).

These are intentionally simple, physically-obvious sanity checks — not a
substitute for the full holdout evaluation in ml_training.py, but a fast
regression guard that would catch a badly broken retrain (e.g. wrong label
polarity, corrupted feature order) before it ever reaches production.
"""
import os
import pickle

import numpy as np
import pandas as pd
import pytest

MODEL_PATH = os.environ.get(
    "MODEL_PATH_FOR_TESTS",
    os.path.join(os.path.dirname(__file__), "..", "ml", "model.pkl"),
)


@pytest.fixture(scope="module")
def model_bundle():
    if not os.path.isfile(MODEL_PATH):
        pytest.skip(f"No model.pkl found at {MODEL_PATH} — train one first.")
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def _predict(bundle, **overrides):
    features = bundle["features"]
    medians = bundle["medians"]
    row = {f: medians.get(f, 0.0) for f in features}
    row.update(overrides)
    X = pd.DataFrame([row])[features]
    proba = bundle["model"].predict_proba(X)[0]
    return float(proba[1])  # P(collision)


def test_model_bundle_has_expected_schema(model_bundle):
    for key in ("model", "features", "medians", "decision_threshold", "metrics"):
        assert key in model_bundle, f"model bundle missing '{key}'"
    assert len(model_bundle["features"]) == 15


def test_obvious_safe_scenario_scores_low(model_bundle):
    # Both vehicles far away, not moving — should score well below threshold.
    prob = _predict(
        model_bundle,
        dista=350, distb=350, distancediff=0, dist_ratio=1.0,
        speeda=0, speedb=0, avgspeed=0,
        accelerationa=0, accelerationb=0, accel_sum=0,
        approachinga=0, approachingb=0,
    )
    assert prob < model_bundle["decision_threshold"], f"expected SAFE, got P(collision)={prob:.4f}"


def test_obvious_high_risk_scenario_scores_high(model_bundle):
    # Both vehicles very close and both approaching fast — should score
    # well above threshold.
    prob = _predict(
        model_bundle,
        dista=5, distb=5, distancediff=0, dist_ratio=1.0,
        speeda=90, speedb=90, avgspeed=90,
        accelerationa=5, accelerationb=5, accel_sum=10,
        approachinga=1, approachingb=1,
    )
    assert prob > model_bundle["decision_threshold"], f"expected HIGH risk, got P(collision)={prob:.4f}"


def test_prediction_is_deterministic(model_bundle):
    # Tolerance (not exact equality): RandomForestClassifier with n_jobs=-1
    # aggregates tree votes across threads, and thread-scheduling-dependent
    # summation order can differ the least-significant bit between calls.
    # That's expected floating-point behavior, not model non-determinism —
    # a real regression would show up as a difference many orders larger.
    kwargs = dict(dista=20, distb=20, avgspeed=40, approachinga=1, approachingb=1)
    p1 = _predict(model_bundle, **kwargs)
    p2 = _predict(model_bundle, **kwargs)
    assert p1 == pytest.approx(p2, abs=1e-9), "same input produced meaningfully different predictions"


def test_feature_order_matches_backend_predict_route():
    """backend/app/routes/predict.py hardcodes FEATURE_ORDER — it must stay
    in sync with the trained model's feature list, or predictions will
    silently use the wrong values for the wrong feature names.

    Only runs where backend/ is reachable on the same filesystem (i.e. from
    the host repo checkout) — the Airflow container intentionally doesn't
    mount the backend service, so this test skips there rather than failing."""
    import re
    predict_py = os.path.join(
        os.path.dirname(__file__), "..", "..", "backend", "app", "routes", "predict.py"
    )
    if not os.path.isfile(predict_py):
        pytest.skip(f"backend/ not reachable from this environment ({predict_py})")
    with open(predict_py) as f:
        content = f.read()
    match = re.search(r"FEATURE_ORDER\s*=\s*\[(.*?)\]", content, re.DOTALL)
    assert match, "could not find FEATURE_ORDER in predict.py"
    backend_features = [x.strip().strip('"').strip("'") for x in match.group(1).split(",") if x.strip()]

    with open(MODEL_PATH if os.path.isfile(MODEL_PATH) else "/dev/null", "rb") as f:
        try:
            bundle = pickle.load(f)
        except Exception:
            pytest.skip("no model.pkl available to compare against")
    assert backend_features == bundle["features"], (
        f"backend FEATURE_ORDER {backend_features} != trained model features {bundle['features']}"
    )
