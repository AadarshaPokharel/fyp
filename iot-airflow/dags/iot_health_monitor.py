"""
dags/iot_health_monitor.py
───────────────────────────
Separate monitoring DAG — runs every minute, checks MongoDB for
danger spikes, and logs alerts to the Airflow UI.

Schedule: every 1 minute
"""

from __future__ import annotations
import datetime
import logging
import os

from airflow.decorators import dag, task
from airflow.utils.dates import days_ago

log = logging.getLogger(__name__)

MONGO_URI  = os.getenv("MONGO_URI",  "mongodb://mongo:27017")
MONGO_DB   = os.getenv("MONGO_DB",   "iot_collision")
MONGO_COLL = os.getenv("MONGO_COLLECTION", "iot_events")

DANGER_RATE_THRESHOLD = 0.30   # alert if >30% of last-minute events are DANGER
WINDOW_SECONDS        = 60


@dag(
    dag_id="iot_health_monitor",
    schedule_interval="* * * * *",   # every minute
    start_date=days_ago(1),
    catchup=False,
    max_active_runs=1,
    tags=["iot", "monitoring"],
)
def health_monitor():

    @task
    def check_danger_rate() -> dict:
        from pymongo import MongoClient

        client     = MongoClient(MONGO_URI)
        collection = client[MONGO_DB][MONGO_COLL]

        since  = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(seconds=WINDOW_SECONDS)
        recent = collection.count_documents({"inserted_at": {"$gte": since}})
        danger = collection.count_documents({"inserted_at": {"$gte": since}, "riskLevel": 2})
        client.close()

        rate = danger / recent if recent > 0 else 0.0
        status = "ALERT" if rate >= DANGER_RATE_THRESHOLD else "OK"

        result = {
            "checked_at":   datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat(),
            "window_sec":   WINDOW_SECONDS,
            "total_recent": recent,
            "danger_count": danger,
            "danger_rate":  round(rate, 4),
            "status":       status,
        }

        if status == "ALERT":
            log.error(
                f"🚨 COLLISION ALERT — danger rate {rate:.1%} "
                f"({danger}/{recent} events in last {WINDOW_SECONDS}s)"
            )
        else:
            log.info(
                f"✓ OK — danger rate {rate:.1%} "
                f"({danger}/{recent} events in last {WINDOW_SECONDS}s)"
            )

        return result

    @task
    def check_csv_freshness() -> dict:
        """Warn if the CSV hasn't been written to in the last 2 minutes (Arduino may be disconnected)."""
        import os
        from pathlib import Path

        csv_path = os.getenv("CSV_PATH", "/opt/airflow/data/events.csv")
        p = Path(csv_path)

        if not p.exists():
            log.warning(f"CSV not found: {csv_path}")
            return {"status": "MISSING", "csv_path": csv_path}

        mtime      = datetime.datetime.fromtimestamp(p.stat().st_mtime)
        age_sec    = (datetime.datetime.now() - mtime).total_seconds()
        status     = "STALE" if age_sec > 120 else "FRESH"

        if status == "STALE":
            log.warning(f"⚠ CSV is STALE — last modified {age_sec:.0f}s ago. Arduino disconnected?")
        else:
            log.info(f"✓ CSV is FRESH — last modified {age_sec:.0f}s ago.")

        return {"status": status, "age_seconds": round(age_sec, 1)}

    @task
    def check_mongo_connectivity() -> str:
        from pymongo import MongoClient
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
            client.admin.command("ping")
            client.close()
            log.info("✓ MongoDB is reachable.")
            return "OK"
        except Exception as e:
            log.error(f"✗ MongoDB unreachable: {e}")
            return f"ERROR: {e}"

    # Run all checks in parallel
    check_danger_rate()
    check_csv_freshness()
    check_mongo_connectivity()


health_monitor()