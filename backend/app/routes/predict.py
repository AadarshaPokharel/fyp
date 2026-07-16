# backend/app/routes/predict.py
"""
Interactive prediction endpoint.
Accepts raw sensor values (all 19 training features), loads the sklearn model
from MODEL_PATH, and returns collision_probability + risk_level.
Falls back to a rule-based mock if MODEL_PATH is not set or model fails to load.
"""
import logging
import os
import numpy as np
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.core.config import MODEL_PATH

logger = logging.getLogger(__name__)
predict_router = APIRouter()

# ── Fix 2: Canonical feature order must match ml_training.py FEATURES list ────
# Canonical feature order — must stay in sync with ml_training.py FEATURES.
# vehiclea / vehicleb REMOVED: dataset leakage (only type-1 vehicles collide).
FEATURE_ORDER = [
    "dista", "distb", "distancediff", "dist_ratio",
    "speeda", "speedb", "avgspeed", "speed_sum", "closing_velocity",
    "accelerationa", "accelerationb", "accel_sum",
    "approachinga", "approachingb",
    "hour_of_day", "day_of_week", "is_rush_hour",
]


# ── Model loader (mtime-based hot-reload) ─────────────────────────────────────

_cached_model = None
_cached_mtime = 0

def _load_model():
    global _cached_model, _cached_mtime
    if not MODEL_PATH or not os.path.isfile(MODEL_PATH):
        logger.warning(f"MODEL_PATH not set or file missing ({MODEL_PATH}). Using rule-based fallback.")
        return None
    try:
        current_mtime = os.path.getmtime(MODEL_PATH)
        if _cached_model is not None and current_mtime == _cached_mtime:
            return _cached_model

        import pickle
        with open(MODEL_PATH, "rb") as f:
            loaded = pickle.load(f)

        if isinstance(loaded, dict):
            model = loaded.get("model")
            if model is None:
                logger.error("Loaded model bundle is missing 'model' key. Using fallback.")
                return None
            _cached_model = {
                "estimator": model,
                "features":  loaded.get("features"),
                "medians":   loaded.get("medians") or {},
                "threshold": float(loaded.get("decision_threshold", 0.61)),
                "payload":   loaded,
            }
        else:
            _cached_model = {
                "estimator": loaded,
                "features":  None,
                "medians":   {},
                "threshold": 0.61,
                "payload":   {},
            }

        _cached_mtime = current_mtime
        logger.info(f"ML model (re)loaded from {MODEL_PATH} | threshold={_cached_model['threshold']:.4f}")
        return _cached_model
    except Exception as exc:
        logger.error(f"Failed to load model: {exc}. Using rule-based fallback.")
        return None


# ── Request schema — all 19 model features ────────────────────────────────────

class PredictRequest(BaseModel):
    # Distance features
    dista:          float = Field(0.0, ge=0)
    distb:          float = Field(0.0, ge=0)
    distancediff:   float = Field(0.0)
    dist_ratio:     float = Field(1.0, ge=0)

    # Speed features
    speeda:          float = Field(0.0, ge=0)
    speedb:          float = Field(0.0, ge=0)
    avgspeed:        float = Field(0.0, ge=0)
    speed_sum:       float = Field(0.0, ge=0)
    closing_velocity: float = Field(0.0)

    # Acceleration features
    accelerationa:   float = Field(0.0)
    accelerationb:   float = Field(0.0)
    accel_sum:       float = Field(0.0)

    # Approach flags
    approachinga:    float = Field(0.0, ge=0, le=1)
    approachingb:    float = Field(0.0, ge=0, le=1)

    # vehiclea / vehicleb REMOVED — data leakage; not a real physical signal.

    # Temporal features
    hour_of_day:     float = Field(12.0, ge=0, le=23)
    day_of_week:     float = Field(1.0,  ge=0, le=6)
    is_rush_hour:    float = Field(0.0,  ge=0, le=1)

    class Config:
        json_schema_extra = {
            "example": {
                "dista": 5, "distb": 5, "distancediff": 0, "dist_ratio": 1.0,
                "speeda": 80, "speedb": 80, "avgspeed": 80, "speed_sum": 160,
                "closing_velocity": 160, "accelerationa": 5, "accelerationb": 5,
                "accel_sum": 10, "approachinga": 1, "approachingb": 1,
                "hour_of_day": 8, "day_of_week": 1, "is_rush_hour": 1,
            }
        }


# ── Rule-based fallback ────────────────────────────────────────────────────────

def _rule_based_predict(req: PredictRequest) -> tuple[str, float, float]:
    """Simple heuristic fallback when no ML model is available."""
    dist_min = min(req.dista, req.distb)
    speed = req.avgspeed

    if dist_min < 20 and speed > 30:
        return "HIGH", 0.85, 0.15
    elif dist_min < 40 or speed > 20:
        return "MEDIUM", 0.35, 0.65
    else:
        return "SAFE", 0.05, 0.95


# ── Endpoint ──────────────────────────────────────────────────────────────────

@predict_router.post("/")
async def predict(body: PredictRequest, current_user: dict = Depends(get_current_user)):
    """
    Submit sensor readings and get an ML risk prediction.

    Returns:
        collision_probability: P(collision) — class 1
        safe_probability:      P(no collision) — class 0
        risk_level:            "SAFE" | "MEDIUM" | "HIGH"
        threshold:             decision threshold used
    """
    model_bundle = _load_model()
    form_data = body.model_dump()

    if model_bundle is not None:
        try:
            estimator = model_bundle["estimator"]
            threshold = model_bundle["threshold"]

            # Fix 2: Build input array from all 19 features in canonical order.
            # Missing features default to 0.0 — never KeyError.
            input_array = np.array([[float(form_data.get(f, 0.0)) for f in FEATURE_ORDER]])

            proba = estimator.predict_proba(input_array)[0]  # [P(no_collision), P(collision)]

            # Fix 3: collision probability is always index 1 (class 1)
            collision_prob = float(proba[1])
            safe_prob      = float(proba[0])

            # Fix 3: risk classification with correct threshold
            if collision_prob >= threshold:
                risk_level = "HIGH"
            elif collision_prob >= 0.30:
                risk_level = "MEDIUM"
            else:
                risk_level = "SAFE"

            source = "ml_model"
            logger.info(
                f"Inference: collision_prob={collision_prob:.4f} threshold={threshold:.4f} → {risk_level}"
            )

        except Exception as exc:
            logger.error(f"Model inference failed: {exc}. Falling back to rules.")
            risk_level, collision_prob, safe_prob = _rule_based_predict(body)
            threshold = 0.61
            source = "rule_fallback"
    else:
        risk_level, collision_prob, safe_prob = _rule_based_predict(body)
        threshold = 0.61
        source = "rule_fallback"

    return {
        "collision_probability": collision_prob,
        "safe_probability":      safe_prob,
        "risk_level":            risk_level,
        "threshold":             threshold,
        "source":                source,
        "model_loaded":          source == "ml_model",
        "model_path":            MODEL_PATH,
    }
