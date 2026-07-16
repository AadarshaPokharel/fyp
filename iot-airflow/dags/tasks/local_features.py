"""
tasks/local_features.py — Snowflake-free training data builder.

Snowflake's free trial expired and its Bronze/Silver/Gold data was deleted,
so this module rebuilds an equivalent "Gold" feature set directly from the
local CSV (the same file the Bronze layer read from), using the EXACT SAME
feature-engineering function (`engineer_features`) that the real production
batch-scoring path (batch_prediction.py) uses at inference time.

This also fixes a real train/serve skew that existed in the old Snowflake
Gold SQL: it recomputed approachingA/B as (speedA > 0) instead of passing
through the raw Arduino flag, while batch_prediction.py always scored using
the raw flag ("Arduino boolean flags — consistent with training, use raw
flags, not derived"). That mismatch affected ~16-20% of rows in the actual
dataset. Building training data this way guarantees the model is trained on
exactly the features it will see at serving time.
"""
import logging

import numpy as np
import pandas as pd

from tasks.config import CSV_PATH
from tasks.batch_prediction import engineer_features

log = logging.getLogger(__name__)


def fetch_gold_from_csv(csv_path: str = None) -> list:
    """Rebuild the Gold-equivalent training table directly from the local CSV.

    Mirrors snowflake_silver.py's cleaning rules and label definition, then
    reuses batch_prediction.py's engineer_features() for the Gold-layer
    feature engineering so training and serving can never drift apart again.
    """
    path = csv_path or CSV_PATH
    try:
        df = pd.read_csv(path)
    except FileNotFoundError:
        log.error(f"CSV not found at {path} — cannot build local training data.")
        return []

    before = len(df)

    # ── Silver-layer cleaning rules (mirrors snowflake_silver.py) ────────────
    df["wall_time"] = pd.to_datetime(df["wall_time"], errors="coerce")
    now = pd.Timestamp.utcnow().tz_localize(None)
    df = df[
        df["distA"].notna() & (df["distA"] > 0) & (df["distA"] <= 400) &
        df["distB"].notna() & (df["distB"] > 0) & (df["distB"] <= 400) &
        (df["speedA"] >= 0) & (df["speedB"] >= 0) &
        df["riskLevel"].isin([0, 1, 2]) &
        df["wall_time"].notna() & (df["wall_time"] <= now)
    ].copy()

    log.info(f"Silver-equivalent cleaning: {before} -> {len(df)} rows ({before - len(df)} dropped)")

    if df.empty:
        log.warning("No rows survived Silver-equivalent cleaning.")
        return []

    # ── Label (mirrors snowflake_silver.py's IS_COLLISION_EVENT rule) ────────
    df["is_collision_event"] = (
        df["vehicleA"].astype(bool) &
        df["vehicleB"].astype(bool) &
        (df["avgSpeed"] > 2.0)
    )

    # ── Feature engineering — reuse the EXACT production scoring logic ──────
    # (dist_ratio, speed_sum, accel_sum, closing_velocity, raw approachingA/B,
    #  hour_of_day, day_of_week, is_rush_hour — see batch_prediction.py)
    df = engineer_features(df)

    # ── Normalise to the lowercase schema ml_training.py expects ────────────
    df = df.rename(columns={
        "distA": "dista", "distB": "distb", "distanceDiff": "distancediff",
        "speedA": "speeda", "speedB": "speedb", "avgSpeed": "avgspeed",
        "approachingA": "approachinga", "approachingB": "approachingb",
        "accelerationA": "accelerationa", "accelerationB": "accelerationb",
        "vehicleA": "vehiclea", "vehicleB": "vehicleb",
    })

    df = df.replace([np.inf, -np.inf], np.nan)

    log.info(f"Built {len(df)} Gold-equivalent rows locally from {path} (Snowflake bypassed).")
    return df.to_dict("records")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    rows = fetch_gold_from_csv()
    print(f"{len(rows)} rows built")
    if rows:
        print(rows[0])
