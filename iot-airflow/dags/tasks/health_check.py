"""
tasks/health_check.py — Task: health_check
Gets pipeline stats from Snowflake Gold — no MongoDB connection needed.
"""

import datetime
import logging
from tasks.config import snowflake_configured, get_snowflake_conn

log = logging.getLogger(__name__)


def pipeline_health_check(csv_rows: int, scored: int, gold_rows: int) -> dict:
    danger = 0
    medium = 0
    total  = gold_rows

    if snowflake_configured():
        try:
            conn   = get_snowflake_conn()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN risk_level = 2 THEN 1 ELSE 0 END) AS danger,
                    SUM(CASE WHEN risk_level = 1 THEN 1 ELSE 0 END) AS medium
                FROM IOT_GOLD.ML_FEATURES
            """)
            row    = cursor.fetchone()
            total  = int(row[0]) if row[0] else 0
            danger = int(row[1]) if row[1] else 0
            medium = int(row[2]) if row[2] else 0
            cursor.close()
            conn.close()
        except Exception as e:
            log.warning(f"Could not query Gold stats: {e}")

    summary = {
        "run_at":         datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat(),
        "csv_rows":       csv_rows,
        "gold_rows":      total,
        "danger_events":  danger,
        "medium_events":  medium,
        "safe_events":    total - danger - medium,
        "collision_rate": round(danger / total, 4) if total else 0,
    }

    for k, v in summary.items():
        log.info(f"  {k}: {v}")

    return summary