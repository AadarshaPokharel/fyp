"""
tasks/snowflake_gold.py — Gold layer
Engineers all 18 ML features from Silver data.
Snowflake table: IOT_GOLD.ML_FEATURES
"""

import logging
from tasks.config import snowflake_configured, get_snowflake_conn

log = logging.getLogger(__name__)

GOLD_DDL = """
CREATE SCHEMA IF NOT EXISTS IOT_GOLD;
CREATE TABLE IF NOT EXISTS IOT_GOLD.ML_FEATURES (
    id                  STRING,
    wall_time           TIMESTAMP_NTZ,
    distA               FLOAT, distB            FLOAT,
    vehicleA            NUMBER, vehicleB         NUMBER,
    distanceDiff        FLOAT,
    speedA              FLOAT, speedB            FLOAT,
    avgSpeed            FLOAT,
    accelerationA       FLOAT, accelerationB     FLOAT,
    approachingA        NUMBER, approachingB      NUMBER,
    dist_ratio          FLOAT,
    both_close          NUMBER,
    speed_sum           FLOAT,
    accel_sum           FLOAT,
    both_approaching    NUMBER,
    hour_of_day         NUMBER,
    day_of_week         NUMBER,
    is_rush_hour        NUMBER,
    closing_velocity    FLOAT,
    risk_level          NUMBER,
    is_collision_event  BOOLEAN,
    feature_created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
"""

GOLD_MERGE_SQL = """
MERGE INTO IOT_GOLD.ML_FEATURES AS target
USING (
    SELECT
        id, wall_time,
        distA, distB,
        CASE WHEN vehicleA = TRUE THEN 1 ELSE 0 END  AS vehicleA,
        CASE WHEN vehicleB = TRUE THEN 1 ELSE 0 END  AS vehicleB,
        distanceDiff, speedA, speedB, avgSpeed,
        accelerationA, accelerationB,
        -- NOTE: pass through the raw Arduino approaching flag rather than
        -- re-deriving it from speedA/speedB > 0. batch_prediction.py (the
        -- real production scoring path) always uses the raw flag, so
        -- re-deriving it here caused ~16-20% train/serve feature skew.
        CASE WHEN approachingA = TRUE THEN 1 ELSE 0 END AS approachingA,
        CASE WHEN approachingB = TRUE THEN 1 ELSE 0 END AS approachingB,
        CASE WHEN distB > 0 THEN distA / (distB + 0.000001) ELSE 0 END AS dist_ratio,
        CASE WHEN distA < 20 AND distB < 20 THEN 1 ELSE 0 END          AS both_close,
        speedA + speedB                               AS speed_sum,
        accelerationA + accelerationB                 AS accel_sum,
        CASE WHEN speedA > 0 AND speedB > 0 THEN 1 ELSE 0 END          AS both_approaching,
        HOUR(wall_time)                               AS hour_of_day,
        -- Snowflake DAYOFWEEK is Sunday=0..Saturday=6; pandas dt.dayofweek
        -- (used at serving time in batch_prediction.py) is Monday=0..Sunday=6.
        -- Convert to the same convention to avoid a second skew source.
        MOD(DAYOFWEEK(wall_time) + 6, 7)              AS day_of_week,
        CASE WHEN HOUR(wall_time) BETWEEN 7 AND 9
              OR  HOUR(wall_time) BETWEEN 17 AND 19
             THEN 1 ELSE 0 END                        AS is_rush_hour,
        (speedA + speedB) / 2.0                       AS closing_velocity,
        risk_level, is_collision_event
    FROM IOT_SILVER.CLEAN_EVENTS
) AS source
ON target.id = source.id
WHEN NOT MATCHED THEN INSERT (
    id, wall_time, distA, distB, vehicleA, vehicleB, distanceDiff,
    speedA, speedB, avgSpeed, accelerationA, accelerationB,
    approachingA, approachingB, dist_ratio, both_close, speed_sum,
    accel_sum, both_approaching, hour_of_day, day_of_week,
    is_rush_hour, closing_velocity, risk_level, is_collision_event
) VALUES (
    source.id, source.wall_time, source.distA, source.distB,
    source.vehicleA, source.vehicleB, source.distanceDiff,
    source.speedA, source.speedB, source.avgSpeed,
    source.accelerationA, source.accelerationB,
    source.approachingA, source.approachingB,
    source.dist_ratio, source.both_close, source.speed_sum,
    source.accel_sum, source.both_approaching, source.hour_of_day,
    source.day_of_week, source.is_rush_hour, source.closing_velocity,
    source.risk_level, source.is_collision_event
);
"""


def load_gold(silver_rows: int) -> int:
    if not snowflake_configured():
        log.warning("Snowflake credentials not set — skipping Gold.")
        return 0

    conn   = get_snowflake_conn()
    cursor = conn.cursor()
    try:
        for stmt in GOLD_DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cursor.execute(stmt)
        cursor.execute(GOLD_MERGE_SQL)
        rows = cursor.rowcount
        conn.commit()
        log.info(f"Gold: merged {rows} ML-ready rows.")
        return rows
    finally:
        cursor.close()
        conn.close()


def _fetch_gold_for_training_local_fallback() -> list:
    from tasks.local_features import fetch_gold_from_csv
    return fetch_gold_from_csv()


def fetch_gold_for_training() -> list:
    if not snowflake_configured():
        log.warning("Snowflake not configured — building training data locally from CSV instead.")
        return _fetch_gold_for_training_local_fallback()

    try:
        conn   = get_snowflake_conn()
        cursor = conn.cursor()
        try:
            # Columns aligned with the leakage-safe FEATURES list in ml_training.py.
            # Removed: BOTH_CLOSE (label proxy, r=0.76), BOTH_APPROACHING (train/serve skew),
            #          RISK_LEVEL (perfect label proxy — 100% predictive of IS_COLLISION_EVENT).
            # Added:   IS_COLLISION_EVENT (new binary target), DAY_OF_WEEK, IS_RUSH_HOUR,
            #          CLOSING_VELOCITY.
            # Fixed:   HOUR_OF_DAY aliased as 'hour_of_day' (was 'hour') to match Gold schema.
            cursor.execute("""
                SELECT
                    wall_time,
                    DISTA               AS dista,
                    DISTB               AS distb,
                    DISTANCEDIFF        AS distancediff,
                    SPEEDA              AS speeda,
                    SPEEDB              AS speedb,
                    AVGSPEED            AS avgspeed,
                    APPROACHINGA        AS approachinga,
                    APPROACHINGB        AS approachingb,
                    ACCELERATIONA       AS accelerationa,
                    ACCELERATIONB       AS accelerationb,
                    VEHICLEA            AS vehiclea,
                    VEHICLEB            AS vehicleb,
                    DIST_RATIO          AS dist_ratio,
                    SPEED_SUM           AS speed_sum,
                    ACCEL_SUM           AS accel_sum,
                    CLOSING_VELOCITY    AS closing_velocity,
                    HOUR_OF_DAY         AS hour_of_day,
                    DAY_OF_WEEK         AS day_of_week,
                    IS_RUSH_HOUR        AS is_rush_hour,
                    IS_COLLISION_EVENT  AS is_collision_event
                FROM IOT_GOLD.ML_FEATURES
                ORDER BY wall_time DESC
                LIMIT 100000
            """)
            cols = [d[0].lower() for d in cursor.description]
            rows = [dict(zip(cols, row)) for row in cursor.fetchall()]
            log.info(f"Fetched {len(rows)} Gold rows for ML training.")
            return rows
        finally:
            cursor.close()
            conn.close()
    except Exception as exc:
        log.error(f"Snowflake query failed ({exc}) — building training data locally from CSV instead.")
        return _fetch_gold_for_training_local_fallback()