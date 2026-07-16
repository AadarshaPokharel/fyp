"""
tasks/batch_prediction.py — Task: batch_predict
Scores unscored MongoDB docs using model.pkl.

Model output (as of leakage-safe rewrite):
  - Target: IS_COLLISION_EVENT (binary: 0=no collision, 1=collision)
  - Output fields written to MongoDB:
      is_collision         (bool)  — direct model prediction
      collision_confidence (float) — P(collision) from predict_proba
      predicted_risk       (int)   — backward-compat mapping: False→0, True→2

Stores results in BOTH:
  - iot_events collection   (is_collision, collision_confidence, predicted_risk, scored_at)
  - predictions collection  (separate doc per prediction)
"""

import datetime
import logging
import pickle
from pathlib import Path

import numpy as np
import pandas as pd

from tasks.config import MONGO_URI, MONGO_DB, MONGO_COLL, MODEL_PATH, BATCH_PRED_SIZE

log = logging.getLogger(__name__)

MONGO_PREDICTION_COLL = "predictions"


# ─────────────────────────────────────────────────────────────
# Feature Engineering — must match training logic exactly.
# Aligned with leakage-safe FEATURES list in ml_training.py.
# ─────────────────────────────────────────────────────────────
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Distance-derived
    df["dist_ratio"] = df["distA"] / (df["distB"] + 1e-6)

    # Speed / accel aggregates
    df["speed_sum"]        = df["speedA"] + df["speedB"]
    df["accel_sum"]        = df["accelerationA"] + df["accelerationB"]
    df["closing_velocity"] = (df["speedA"] + df["speedB"]) / 2.0

    # Arduino boolean flags (consistent with training — use raw flags, not derived)
    df["approachingA"] = df["approachingA"].astype(bool).astype(int)
    df["approachingB"] = df["approachingB"].astype(bool).astype(int)

    # Vehicle type to int
    df["vehicleA"] = df["vehicleA"].astype(int)
    df["vehicleB"] = df["vehicleB"].astype(int)

    # Temporal features
    df["wall_time"]    = pd.to_datetime(df["wall_time"], errors="coerce")
    df["hour_of_day"]  = df["wall_time"].dt.hour.fillna(0).astype(int)
    df["day_of_week"]  = df["wall_time"].dt.dayofweek.fillna(0).astype(int)
    df["is_rush_hour"] = df["hour_of_day"].apply(
        lambda h: 1 if (7 <= h <= 9 or 17 <= h <= 19) else 0
    )

    return df


# ─────────────────────────────────────────────────────────────
# Prediction Task
# ─────────────────────────────────────────────────────────────
def run_batch_prediction(training_status: str) -> int:

    if not Path(MODEL_PATH).exists():
        log.info("No model.pkl found — skipping prediction.")
        return 0

    try:
        import certifi
        from pymongo import MongoClient, UpdateOne

        client = MongoClient(
            MONGO_URI,
            tlsCAFile=certifi.where(),
            serverSelectionTimeoutMS=10000,
        )

        events_col      = client[MONGO_DB][MONGO_COLL]
        predictions_col = client[MONGO_DB][MONGO_PREDICTION_COLL]

        # ── Load model ─────────────────────────────────────────
        with open(MODEL_PATH, "rb") as f:
            bundle = pickle.load(f)

        clf           = bundle["model"]
        features      = bundle["features"]
        medians       = bundle.get("medians", {})
        model_version = bundle.get("trained_at", "unknown")
        model_target  = bundle.get("target", "is_collision_event")

        log.info(f"Loaded model | target={model_target} | features={len(features)}")

        # ── Fetch unscored events ──────────────────────────────
        # Use is_collision field as the "scored" marker (new schema)
        unscored = list(
            events_col
            .find({"is_collision": {"$exists": False}})
            .limit(BATCH_PRED_SIZE)
        )

        if not unscored:
            log.info("No unscored events.")
            client.close()
            return 0

        log.info(f"Scoring {len(unscored)} events...")

        # ── Prepare DataFrame ──────────────────────────────────
        df = pd.DataFrame(unscored)

        # Feature engineering — must mirror training pipeline
        df = engineer_features(df)

        # Normalise column names: MongoDB camelCase → training lowercase
        rename_map = {
            "distA": "dista", "distB": "distb", "distanceDiff": "distancediff",
            "speedA": "speeda", "speedB": "speedb", "avgSpeed": "avgspeed",
            "approachingA": "approachinga", "approachingB": "approachingb",
            "accelerationA": "accelerationa", "accelerationB": "accelerationb",
            "vehicleA": "vehiclea", "vehicleB": "vehicleb",
        }
        df = df.rename(columns=rename_map)

        # Apply same preprocessing as training
        X = df[features].fillna(medians).replace([np.inf, -np.inf], 0)

        # ── Predict ────────────────────────────────────────────
        preds  = clf.predict(X)        # 0 = no collision, 1 = collision
        probas = clf.predict_proba(X)  # [[p0, p1], ...]

        classes       = list(clf.classes_)
        collision_idx = classes.index(1) if 1 in classes else 1

        # ── Prepare MongoDB updates ────────────────────────────
        event_updates   = []
        prediction_docs = []

        for i, doc in enumerate(unscored):
            is_collision         = bool(preds[i])
            collision_confidence = float(probas[i][collision_idx])

            # Backward-compatible predicted_risk for frontend (RiskBadge, CollisionGauge)
            # Binary model has no MEDIUM class — map False→0 (SAFE), True→2 (HIGH)
            predicted_risk = 2 if is_collision else 0

            # collision_prob dict — frontend reads .safe / .medium / .high
            collision_prob = {
                "safe":   float(probas[i][0]),
                "medium": 0.0,               # binary model; no medium class
                "high":   collision_confidence,
            }

            scored_at = datetime.datetime.utcnow()

            # Update main iot_events doc
            event_updates.append(UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {
                    "is_collision":         is_collision,
                    "collision_confidence": collision_confidence,
                    "predicted_risk":       predicted_risk,
                    "collision_prob":       collision_prob,
                    "scored_at":            scored_at,
                }},
            ))

            # Insert into predictions collection
            prediction_docs.append({
                "event_id":            doc["_id"],
                "is_collision":        is_collision,
                "collision_confidence": collision_confidence,
                "predicted_risk":      predicted_risk,
                "collision_prob":      collision_prob,
                "scored_at":           scored_at,
                "model_version":       model_version,
            })

        # ── Write to MongoDB ───────────────────────────────────
        if event_updates:
            events_col.bulk_write(event_updates, ordered=False)
            n_collisions = sum(1 for p in preds if p == 1)
            log.info(
                f"Updated {len(event_updates)} events | "
                f"{n_collisions} predicted collisions "
                f"({n_collisions/len(event_updates)*100:.1f}%)"
            )

        if prediction_docs:
            predictions_col.insert_many(prediction_docs, ordered=False)
            log.info(f"Inserted {len(prediction_docs)} prediction docs")

        client.close()
        return len(event_updates)

    except Exception as e:
        log.warning(f"Batch prediction failed: {e}")
        return 0


# ─────────────────────────────────────────────────────────────
# Run standalone (for manual testing outside Airflow)
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run_batch_prediction("manual")
    print(f"Scored {result} events")
