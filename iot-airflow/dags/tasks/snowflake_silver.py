"""
tasks/snowflake_silver.py — Silver layer
Cleans and validates Bronze data.
Snowflake table: IOT_SILVER.CLEAN_EVENTS
"""

import logging
from tasks.config import snowflake_configured, get_snowflake_conn

log = logging.getLogger(__name__)

 
SILVER_DDL = """
CREATE SCHEMA IF NOT EXISTS IOT_SILVER;
CREATE TABLE IF NOT EXISTS IOT_SILVER.CLEAN_EVENTS (
    ID                  VARCHAR,
    WALL_TIME           TIMESTAMP_NTZ,
    TIMESTAMP_MS        NUMBER(38,0),
    DISTA               FLOAT,
    DISTB               FLOAT,
    VEHICLEA            BOOLEAN,
    VEHICLEB            BOOLEAN,
    DISTANCEDIFF        FLOAT,
    SPEEDA              FLOAT,
    SPEEDB              FLOAT,
    AVGSPEED            FLOAT,
    ACCELERATIONA       FLOAT,
    ACCELERATIONB       FLOAT,
    APPROACHINGA        BOOLEAN,
    APPROACHINGB        BOOLEAN,
    RISK_LEVEL          NUMBER(38,0),
    IS_COLLISION_EVENT  BOOLEAN,
    CLEANED_AT          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
"""
 
# Reads from Bronze, applies filter rules, inserts into Silver.
# Uses MERGE so safe to run multiple times (idempotent).
SILVER_MERGE_SQL = """
MERGE INTO IOT_SILVER.CLEAN_EVENTS AS tgt
USING (
    SELECT
        b.ID,
        b.WALL_TIME,
        b.TIMESTAMP_MS,
        b.DISTA,
        b.DISTB,
        b.VEHICLEA,
        b.VEHICLEB,
        b.DISTANCEDIFF,
        b.SPEEDA,
        b.SPEEDB,
        b.AVGSPEED,
        b.ACCELERATIONA,
        b.ACCELERATIONB,
        b.APPROACHINGA,
        b.APPROACHINGB,
        b.RISK_LEVEL,
        -- Rule-based flag derived from sensor data only (NOT from ML model)
        IFF(b.VEHICLEA = TRUE AND b.VEHICLEB = TRUE AND b.AVGSPEED > 2.0,
            TRUE, FALSE)  AS IS_COLLISION_EVENT
    FROM IOT_BRONZE.RAW_EVENTS AS b
    WHERE
        -- Distance range: HC-SR04 reliable range is 2 to 400 cm
        b.DISTA IS NOT NULL AND b.DISTA > 0  AND b.DISTA  <= 400
        AND b.DISTB IS NOT NULL AND b.DISTB > 0  AND b.DISTB  <= 400
        -- Speed must be non-negative
        AND b.SPEEDA >= 0
        AND b.SPEEDB >= 0
        -- Valid Arduino risk classification only
        AND b.RISK_LEVEL IN (0, 1, 2)
        -- No future-dated readings (Arduino clock drift)
        AND b.WALL_TIME <= CURRENT_TIMESTAMP()
) AS src
ON tgt.ID = src.ID
WHEN NOT MATCHED THEN INSERT (
    ID, WALL_TIME, TIMESTAMP_MS,
    DISTA, DISTB, VEHICLEA, VEHICLEB,
    DISTANCEDIFF, SPEEDA, SPEEDB, AVGSPEED,
    ACCELERATIONA, ACCELERATIONB,
    APPROACHINGA, APPROACHINGB,
    RISK_LEVEL, IS_COLLISION_EVENT
) VALUES (
    src.ID, src.WALL_TIME, src.TIMESTAMP_MS,
    src.DISTA, src.DISTB, src.VEHICLEA, src.VEHICLEB,
    src.DISTANCEDIFF, src.SPEEDA, src.SPEEDB, src.AVGSPEED,
    src.ACCELERATIONA, src.ACCELERATIONB,
    src.APPROACHINGA, src.APPROACHINGB,
    src.RISK_LEVEL, src.IS_COLLISION_EVENT
);
"""
 
def load_silver(bronze_rows: int) -> int:
    if not snowflake_configured():
        log.warning("Snowflake credentials not set — skipping Silver.")
        return 0
 
    conn   = get_snowflake_conn()
    cursor = conn.cursor()
    try:
        for stmt in SILVER_DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                cursor.execute(stmt)
        cursor.execute(SILVER_MERGE_SQL)
        rows = cursor.rowcount
        conn.commit()
        log.info(f"Silver: merged {rows} clean rows.")
        return rows
    finally:
        cursor.close()
        conn.close()
 