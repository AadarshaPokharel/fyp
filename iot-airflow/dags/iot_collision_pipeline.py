"""
dags/iot_collision_pipeline.py
───────────────────────────────
Main pipeline DAG — runs every 5 minutes.

MongoDB is handled by live_pipeline.py (real-time, smart filtered).
This DAG owns Snowflake: Bronze → Silver → Gold → ML → Email.

Task flow:
  check_csv → bronze → silver → gold → train_model
                                            ↓
                                      batch_predict
                                            ↓
                                 cleanup_orphan_predictions
                                            ↓
                                      health_check → email_summary
"""

from airflow.decorators import dag, task
from airflow.utils.dates import days_ago

from tasks.check_csv                   import check_csv_has_new_data         as _check_csv
from tasks.ml_training                 import run_ml_training                 as _train
from tasks.batch_prediction            import run_batch_prediction            as _predict
from tasks.cleanup_orphan_predictions  import run_cleanup_orphan_predictions  as _cleanup
from tasks.snowflake_bronze            import load_bronze                     as _bronze
from tasks.snowflake_silver            import load_silver                     as _silver
from tasks.snowflake_gold              import load_gold                       as _gold
from tasks.health_check                import pipeline_health_check           as _health
from tasks.send_email                  import send_summary_email              as _email


@dag(
    dag_id="iot_collision_pipeline",
    schedule_interval="*/5 * * * *",
    start_date=days_ago(1),
    catchup=False,
    max_active_runs=1,
    tags=["iot", "collision", "ml", "medallion"],
)
def iot_pipeline():

    @task
    def check_csv() -> int:
        return _check_csv()

    @task
    def bronze(csv_rows: int) -> int:
        return _bronze(csv_rows)

    @task
    def silver(bronze_rows: int) -> int:
        return _silver(bronze_rows)

    @task
    def gold(silver_rows: int) -> int:
        return _gold(silver_rows)

    @task
    def train_model(gold_rows: int) -> str:
        return _train(gold_rows)

    @task
    def batch_predict(training_status: str) -> int:
        return _predict(training_status)

    @task
    def cleanup_orphan_predictions(scored: int) -> int:
        return _cleanup(scored)

    @task
    def health_check(csv_rows: int, scored: int, gold_rows: int) -> dict:
        return _health(csv_rows, scored, gold_rows)

    @task
    def email_summary(summary: dict) -> str:
        return _email(summary)

    # ── Wire up ───────────────────────────────────────────────────────────────
    csv_rows    = check_csv()
    bronze_rows = bronze(csv_rows)
    silver_rows = silver(bronze_rows)
    gold_rows   = gold(silver_rows)
    trained     = train_model(gold_rows)
    scored      = batch_predict(trained)
    orphans     = cleanup_orphan_predictions(scored)
    summary     = health_check(csv_rows, scored, gold_rows)
    email_summary(summary)

    # cleanup_orphan_predictions must complete before health_check runs
    orphans >> summary


iot_pipeline()