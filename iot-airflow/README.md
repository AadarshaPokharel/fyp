# IoT Airflow

Apache Airflow project for scheduled ETL and model training.

## Main Responsibilities

- Move processed IoT data through Bronze/Silver/Gold layers
- Trigger ML training using Gold data
- Save trained model bundle (`model.pkl`) to `iot-airflow/ml/`

## Key Paths

- `dags/` - Airflow DAG definitions
- `dags/tasks/` - task implementations (Snowflake, training, batch prediction)
- `ml/model.pkl` - latest trained model artifact

## Run (Docker Compose)

```bash
cd /home/aadarsha/fyp/iot-airflow
docker compose up -d
```

This starts Postgres, Airflow init, webserver, and scheduler. The **`serial-logger`** service is **not** started by default (it needs a USB serial device).

Open Airflow UI (if configured): `http://localhost:8080`

### Arduino / USB serial (optional)

If you plug in an Arduino (or similar) and it appears as `/dev/ttyACM0`, start the logger with the **`serial`** profile:

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
   - Creates `is_collision_event` rule flag.
   - Writes cleaned records to `IOT_SILVER.CLEAN_EVENTS`.

3. **Gold (`tasks/snowflake_gold.py`)**
   - Engineers ML features such as:
     - `dist_ratio`, `both_close`, `speed_sum`, `accel_sum`, `both_approaching`, `hour_of_day`
   - Writes ML-ready data to `IOT_GOLD.ML_FEATURES`.

### Random Forest Training (`tasks/ml_training.py`)

- Fetches Gold features and validates schema.
- Uses label column `risk_level`.
- Training pre-checks:
  - minimum rows (`MIN_ROWS_TRAIN`)
  - at least 2 classes present
  - enough new rows since previous model (`MIN_NEW_ROWS_RETRAIN`)
- Converts `wall_time` to datetime and sorts chronologically.
- Missing values are handled with **median imputation**.
- Uses **time-based split**: first 80% train, last 20% test.
- Trains `RandomForestClassifier` with:
  - `n_estimators=200`
  - `max_depth=12`
  - `min_samples_split=5`
  - `class_weight="balanced"`
  - `random_state=42`
- Evaluates and logs classification report + accuracy.
- Saves model bundle (`model`, `features`, `medians`, metadata) to `ml/model.pkl`.

## Notes

- Ensure required credentials/config are set in Airflow/task config.
- The backend reads the trained model via `MODEL_PATH`.
