
"""
tasks/snowflake_bronze.py — Bronze layer
Reads from CSV file directly → inserts into Snowflake Bronze.
Snowflake table: IOT_BRONZE.RAW_EVENTS
"""
import csv
import math
import os
import logging
from tasks.config import CSV_PATH, snowflake_configured, get_snowflake_conn

log = logging.getLogger(__name__)


def _safe(val, as_type=float):
    try:
        v = as_type(val)
        if as_type is float and (math.isinf(v) or math.isnan(v)):
            return None
        return v
    except (TypeError, ValueError):
        return None


def _bool(val):
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("true", "1", "yes")
    return bool(val)


def load_bronze(csv_rows: int) -> int:
    if not os.path.exists(CSV_PATH):
        log.warning(f"CSV not found: {CSV_PATH}")
        return 0
    if not snowflake_configured():
        log.warning("Snowflake credentials not set — skipping Bronze.")
        return 0

    # Read CSV
    rows = []
    try:
        with open(CSV_PATH, newline="") as f:
            reader = csv.DictReader(f)
            for i, row in enumerate(reader):
                try:
                     # --- New ID generation from wall_time and timestamp ---
                    wall_time = row.get("wall_time")
                    ts = row.get("timestamp")
                    if not wall_time or not ts:
                        log.warning(f"Skipping row {i}: missing wall_time or timestamp")
                        continue   # skip this row entirely

                    # Create a deterministic ID
                    row_id = f"{wall_time}_{ts}"
                    rows.append((
                        row_id,
                        wall_time,
                        _safe(ts, int),
                        _safe(row.get("distA")),
                        _safe(row.get("distB")),
                        _bool(row.get("vehicleA", False)),
                        _bool(row.get("vehicleB", False)),
                        _safe(row.get("distanceDiff")),
                        _safe(row.get("speedA")),
                        _safe(row.get("speedB")),
                        _safe(row.get("avgSpeed")),
                        _safe(row.get("accelerationA")),
                        _safe(row.get("accelerationB")),
                        _bool(row.get("approachingA", False)),
                        _bool(row.get("approachingB", False)),
                        _safe(row.get("riskLevel"), int),
                    ))
                except (ValueError, TypeError) as e:
                    log.warning(f"Skipping row {i}: {e}")
    except FileNotFoundError:
        log.warning(f"CSV not found: {CSV_PATH}")
        return 0

    if not rows:
        log.info("No rows in CSV to load into Bronze.")
        return 0

    log.info(f"Read {len(rows)} rows from CSV.")

    conn = get_snowflake_conn()
    cur  = conn.cursor()
    try:
        # Execute each DDL statement separately — Snowflake allows only 1 per execute()
        cur.execute("CREATE SCHEMA IF NOT EXISTS IOT_BRONZE")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS IOT_BRONZE.RAW_EVENTS (
                ID              VARCHAR,
                WALL_TIME       TIMESTAMP_NTZ,
                TIMESTAMP_MS    NUMBER(38,0),
                DISTA           FLOAT,
                DISTB           FLOAT,
                VEHICLEA        BOOLEAN,
                VEHICLEB        BOOLEAN,
                DISTANCEDIFF    FLOAT,
                SPEEDA          FLOAT,
                SPEEDB          FLOAT,
                AVGSPEED        FLOAT,
                ACCELERATIONA   FLOAT,
                ACCELERATIONB   FLOAT,
                APPROACHINGA    BOOLEAN,
                APPROACHINGB    BOOLEAN,
                RISK_LEVEL      NUMBER(38,0),
                INGESTED_AT     TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
            )
        """)

        cur.execute("SELECT ID FROM IOT_BRONZE.RAW_EVENTS")
        existing_ids = {r[0] for r in cur.fetchall()}

        new_rows = [r for r in rows if r[0] not in existing_ids]
        if not new_rows:
            log.info("All CSV rows already in Bronze — nothing to insert.")
            return 0

        cur.executemany(
            """
            INSERT INTO IOT_BRONZE.RAW_EVENTS (
                ID, WALL_TIME, TIMESTAMP_MS,
                DISTA, DISTB, VEHICLEA, VEHICLEB,
                DISTANCEDIFF, SPEEDA, SPEEDB, AVGSPEED,
                ACCELERATIONA, ACCELERATIONB,
                APPROACHINGA, APPROACHINGB,
                RISK_LEVEL
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            new_rows,
        )
        conn.commit()
        log.info(f"Bronze: inserted {len(new_rows)} rows into IOT_BRONZE.RAW_EVENTS.")
        return len(new_rows)

    finally:
        cur.close()
        conn.close()
