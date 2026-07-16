"""
Unit tests for tasks/local_features.py — the Snowflake-free training data
builder. These lock in two things that must never silently regress:

1. The Silver-layer cleaning rules (distance range, non-negative speed,
   valid risk_level, no future timestamps).
2. The IS_COLLISION_EVENT label definition (vehicleA AND vehicleB AND
   avgSpeed > 2.0).

Also includes a regression test for the approachingA/B train-serve skew
bug: local_features.py must produce the exact same approachingA/B values
as batch_prediction.py's engineer_features(), since that was the whole
point of routing training data through the same function.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "dags"))

from tasks.local_features import fetch_gold_from_csv  # noqa: E402
from tasks.batch_prediction import engineer_features  # noqa: E402


@pytest.fixture
def sample_csv(tmp_path):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [
        # Valid, no collision: distances fine, no vehicles present
        dict(wall_time=now, timestamp=1, distA=100, distB=100, vehicleA=0, vehicleB=0,
             distanceDiff=0, speedA=0, approachingA=0, speedB=0, approachingB=0,
             avgSpeed=0, accelerationA=0, accelerationB=0, riskLevel=0),
        # Valid, collision: both vehicles present, fast
        dict(wall_time=now, timestamp=2, distA=5, distB=5, vehicleA=1, vehicleB=1,
             distanceDiff=0, speedA=80, approachingA=1, speedB=80, approachingB=1,
             avgSpeed=80, accelerationA=1, accelerationB=1, riskLevel=2),
        # Invalid: distance out of HC-SR04 range (>400cm) — must be dropped
        dict(wall_time=now, timestamp=3, distA=500, distB=100, vehicleA=0, vehicleB=0,
             distanceDiff=400, speedA=10, approachingA=1, speedB=10, approachingB=0,
             avgSpeed=10, accelerationA=0, accelerationB=0, riskLevel=0),
        # Invalid: distance is zero (sensor error sentinel) — must be dropped
        dict(wall_time=now, timestamp=4, distA=0, distB=100, vehicleA=0, vehicleB=0,
             distanceDiff=100, speedA=10, approachingA=0, speedB=0, approachingB=0,
             avgSpeed=5, accelerationA=0, accelerationB=0, riskLevel=0),
        # Invalid: negative speed — must be dropped
        dict(wall_time=now, timestamp=5, distA=50, distB=50, vehicleA=0, vehicleB=0,
             distanceDiff=0, speedA=-5, approachingA=0, speedB=10, approachingB=0,
             avgSpeed=2.5, accelerationA=0, accelerationB=0, riskLevel=0),
        # Invalid: bad riskLevel — must be dropped
        dict(wall_time=now, timestamp=6, distA=50, distB=50, vehicleA=0, vehicleB=0,
             distanceDiff=0, speedA=10, approachingA=1, speedB=10, approachingB=1,
             avgSpeed=10, accelerationA=0, accelerationB=0, riskLevel=9),
        # Invalid: future-dated (clock drift) — must be dropped
        dict(wall_time=now + timedelta(days=365), timestamp=7, distA=50, distB=50,
             vehicleA=0, vehicleB=0, distanceDiff=0, speedA=10, approachingA=0,
             speedB=10, approachingB=0, avgSpeed=10, accelerationA=0, accelerationB=0,
             riskLevel=0),
        # Valid: one vehicle, fast — NOT a collision (needs both vehicles)
        dict(wall_time=now, timestamp=8, distA=5, distB=5, vehicleA=1, vehicleB=0,
             distanceDiff=0, speedA=80, approachingA=1, speedB=80, approachingB=1,
             avgSpeed=80, accelerationA=1, accelerationB=1, riskLevel=1),
        # Valid: both vehicles, but slow — NOT a collision (needs avgSpeed > 2.0)
        dict(wall_time=now, timestamp=9, distA=5, distB=5, vehicleA=1, vehicleB=1,
             distanceDiff=0, speedA=1, approachingA=1, speedB=1, approachingB=1,
             avgSpeed=1.0, accelerationA=0, accelerationB=0, riskLevel=1),
    ]
    path = tmp_path / "events.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return str(path)


def test_silver_cleaning_drops_invalid_rows(sample_csv):
    rows = fetch_gold_from_csv(csv_path=sample_csv)
    df = pd.DataFrame(rows)
    # 9 input rows; 4 are invalid (out-of-range dist, zero dist, negative
    # speed, bad risk_level, future timestamp = 5 invalid) -> 4 should survive
    assert len(df) == 4, f"expected 4 valid rows, got {len(df)}: timestamps={sorted(df['timestamp'].tolist()) if len(df) else []}"
    assert set(df["timestamp"]) == {1, 2, 8, 9}


def test_collision_label_requires_both_vehicles_and_speed(sample_csv):
    rows = fetch_gold_from_csv(csv_path=sample_csv)
    df = pd.DataFrame(rows).set_index("timestamp")

    assert df.loc[1, "is_collision_event"] == False  # noqa: E712 — no vehicles
    assert df.loc[2, "is_collision_event"] == True   # both vehicles, fast
    assert df.loc[8, "is_collision_event"] == False  # noqa: E712 — only one vehicle
    assert df.loc[9, "is_collision_event"] == False  # noqa: E712 — both vehicles but too slow


def test_approaching_flags_match_production_scoring_exactly(sample_csv):
    """Regression test for the fixed train/serve skew: local_features.py
    must reuse engineer_features() so approachingA/B in the training table
    are always identical to what batch_prediction.py computes at serving
    time — never re-derived from speedA/speedB > 0."""
    rows = fetch_gold_from_csv(csv_path=sample_csv)
    df = pd.DataFrame(rows)

    raw = pd.read_csv(sample_csv)
    raw["wall_time"] = pd.to_datetime(raw["wall_time"])
    expected = engineer_features(raw)

    merged = df.merge(
        expected[["timestamp", "approachingA", "approachingB"]],
        on="timestamp", suffixes=("", "_expected"),
    )
    assert (merged["approachinga"] == merged["approachingA"]).all()
    assert (merged["approachingb"] == merged["approachingB"]).all()


def test_missing_csv_returns_empty_list_not_exception():
    rows = fetch_gold_from_csv(csv_path="/nonexistent/path/events.csv")
    assert rows == []
