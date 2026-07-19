# IoT Airflow

Apache Airflow project for scheduled ETL and model training.

## Main Responsibilities

- Move processed IoT data through Bronze/Silver/Gold layers
- Trigger ML training using Gold data
- Save trained model bundle (`model.pkl`) to `iot-airflow/ml/`

## Key Paths

- `dags/` - Airflow DAG definitions. Only two real DAGs live here: `iot_collision_pipeline.py` (every 5 min) and `iot_health_monitor.py` (every 1 min). A handful of ad-hoc diagnostic scripts that used to sit in this folder — none of them real DAGs, one with a destructive `shutil.rmtree()` on `ml/runs/` that had only failed to fire by luck — were removed. Airflow's DAG-file scanner imports every `.py` file it finds here, so keep this folder limited to actual DAGs.
- `dags/tasks/` - task implementations:
  - `snowflake_bronze.py`, `snowflake_silver.py`, `snowflake_gold.py` - Bronze/Silver/Gold ETL against Snowflake
  - `local_features.py` - **Snowflake-free fallback.** Rebuilds the Gold-equivalent feature table directly from `data/events.csv`, reusing `batch_prediction.engineer_features()` so training and live scoring can never drift apart. `snowflake_gold.fetch_gold_for_training()` calls this automatically whenever Snowflake is unconfigured or unreachable.
  - `ml_training.py` - trains the Random Forest and selects the decision threshold
  - `batch_prediction.py` - scores live/unscored MongoDB events with the trained model (the actual production feature-engineering source of truth)
- `ml/model.pkl` - latest trained model artifact
- `ml/runs/run_<timestamp>/` - one archive per training run (classification report, confusion matrix, ROC/PR curves, feature importance, archived `model.pkl`)
- `tests/` - pytest suite for the training/serving pipeline (`test_local_features.py`, `test_model_predictions.py`); run with `python -m pytest tests/`

## Run (Docker Compose)

The compose file lives at the **project root** (`/home/aadarsha/fyp/docker-compose.yml`), not in this folder — it orchestrates Postgres/Airflow alongside the backend and frontend containers.

```bash
cd /home/aadarsha/fyp
docker compose up -d postgres airflow-init airflow-webserver airflow-scheduler
```

(Or just `docker compose up -d` with no service names to also bring up `backend` and `frontend` in the same command — see the top-level `README.md`.)

This starts Postgres, Airflow init, webserver, and scheduler. The **`serial-logger`** service is **not** started by default (it needs a USB serial device).

Open Airflow UI (if configured): `http://localhost:8080`

### Arduino / USB serial (optional)

If you plug in an Arduino (or similar) and it appears as `/dev/ttyACM0`, start the logger with the **`serial`** profile (from the project root):

```bash
docker compose --profile serial up -d
```

If you see `no such file or directory` for `/dev/ttyACM0`, the board is unplugged or uses another port (e.g. `/dev/ttyUSB0`). In that case either connect the device or run **without** the `serial` profile (default `docker compose up -d`).

## DAG Schedule

- `iot_collision_pipeline`: every 5 minutes
- `iot_health_monitor`: every 1 minute

## Retraining Rule

Training task now skips retraining unless enough new rows are available since the previous model:

- `MIN_NEW_ROWS_RETRAIN` (default: `200`)
- configured in `dags/tasks/config.py` via env var

Example:

```env
MIN_NEW_ROWS_RETRAIN=200
```

## Data Cleaning and Random Forest Training

### Cleaning Flow (Bronze -> Silver -> Gold)

1. **Bronze (`tasks/snowflake_bronze.py`)**
   - Reads CSV rows and safely converts values.
   - Invalid numeric values (`NaN`, `inf`, parse errors) are converted to `None`.
   - Skips rows missing `wall_time` or `timestamp`.
   - Generates deterministic row ID: `wall_time + "_" + timestamp`.
   - Deduplicates before insert into `IOT_BRONZE.RAW_EVENTS`.

2. **Silver (`tasks/snowflake_silver.py`)**
   - Filters invalid/outlier records:
     - `distA`, `distB` must be in `(0, 400]`
     - `speedA`, `speedB` must be `>= 0`
     - `risk_level` must be in `(0,1,2)`
     - `wall_time` cannot be in the future
   - Creates the **`is_collision_event`** label: `vehicleA AND vehicleB AND avgSpeed > 2.0`. This is the actual training target — `risk_level` itself is only used as a Bronze/Silver validity filter, never as a feature (including it would be target leakage — it's ~100% predictive of the label by construction).
   - Writes cleaned records to `IOT_SILVER.CLEAN_EVENTS`.

3. **Gold (`tasks/snowflake_gold.py`, or `tasks/local_features.py` when Snowflake is unavailable)**
   - Engineers the full feature set (`dist_ratio`, `speed_sum`, `accel_sum`, `both_close`, `both_approaching`, `closing_velocity`, `hour_of_day`, `day_of_week`, `is_rush_hour`, ...), but **not all of them are used for training** — see below.

### Random Forest Training (`tasks/ml_training.py`)

- Fetches Gold features (transparently falls back to `local_features.py` if Snowflake is unreachable — see `dags/tasks/local_features.py` above).
- **Target:** `is_collision_event` (binary).
- **The 15 features actually used for training** (deliberately narrower than everything Gold computes):
  `dista`, `distb`, `distancediff`, `dist_ratio`, `speeda`, `speedb`, `avgspeed`, `accelerationa`, `accelerationb`, `accel_sum`, `approachinga`, `approachingb`, `hour_of_day`, `day_of_week`, `is_rush_hour`.
  Excluded, each for a documented reason in `ml_training.py`: `risk_level`/`both_close` (target leakage), `vehiclea`/`vehicleb` (dataset-collection artifact, not a real physical signal), `speed_sum`/`closing_velocity` (exact duplicates of `avgspeed` — confirmed via correlation=1.0000 and ~0 permutation importance).
- Training pre-checks:
  - minimum rows (`MIN_ROWS_TRAIN`)
  - at least 2 classes present
  - enough new rows since previous model (`MIN_NEW_ROWS_RETRAIN`)
- Converts `wall_time` to datetime and sorts chronologically.
- Missing values are handled with **median imputation computed from the training split only**.
- Uses a **time-based split**: first 80% train, last 20% test (chronological, not random — this is time-series/session data).
- Trains `RandomForestClassifier` with hyperparameters chosen by `RandomizedSearchCV` (searching `n_estimators`, `max_depth`, `min_samples_split`, `min_samples_leaf`, `max_features`, `class_weight`), scored on `f1_macro` with `TimeSeriesSplit(5)` — not a single fixed hyperparameter set.
- A **Gaussian sensor-noise simulation** (σ=2.5cm on distance, σ=1.0 on speed) approximates real-world sensor imprecision, and the **decision threshold is chosen by maximizing F2** (recall weighted over precision, since a missed collision is far costlier than an extra warning) against that noisy simulation — not against the clean hold-out.
- Evaluates and logs the full classification report (clean and noisy) plus feature importances.
- Saves the model bundle (`model`, `features`, `medians`, `decision_threshold`, metrics) to `ml/model.pkl`, and archives a full copy plus plots under `ml/runs/run_<timestamp>/`.

For the full methodology behind these choices — including a from-scratch leakage/session-contamination investigation, model comparison against 9 other algorithms, and robustness stress testing — see [`docs/ml_audit/`](../docs/ml_audit/) at the project root.

## Notes

- Ensure required credentials/config are set in Airflow/task config.
- The backend reads the trained model via `MODEL_PATH`.
