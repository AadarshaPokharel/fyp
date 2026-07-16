# FYP - IoT Collision Prediction Platform

This repository contains a full-stack IoT collision-risk platform with data ingestion, ML training, API services, and a web dashboard.

## Project Folders

- `backend/` - FastAPI backend, auth, dashboards APIs, prediction APIs.
- `frontend/` - React app for admin and policy maker workflows.
- `iot-airflow/` - Airflow DAGs for batch processing and ML training.
- `iot-pipeline/` - Local/live ingestion scripts from serial/CSV to MongoDB.
- `data/` - Local datasets used for testing and analysis.

## Run everything at once (recommended)

From the project root, one terminal:

```bash
./scripts/run-all.sh
```

This starts:

- **Docker**: Airflow + Postgres (`iot-airflow/docker-compose.yml`) — no USB serial container (avoids missing `/dev/ttyACM0`).
- **Backend**: FastAPI on `http://127.0.0.1:8000`
- **Frontend**: Vite on `http://127.0.0.1:5173`

**Prerequisites:** Docker running, `backend/venv` installed, `frontend` has `npm install` done.

**Stop:** `Ctrl+C` stops backend + frontend and runs `docker compose down` for `iot-airflow`.

**Port 8000 already in use:** Another `uvicorn` (or old run) is still bound. Either stop it, or start everything with:

```bash
RUN_ALL_FREE_PORTS=1 ./scripts/run-all.sh
```

That tries to free ports `8000` and `5173` before starting. You can also run `ss -ltnp '( sport = :8000 )'` and `kill <pid>` manually.

- Keep Docker running after exit: `RUN_ALL_DOCKER_DOWN=0 ./scripts/run-all.sh`
- Also start **live Arduino pipeline** (needs USB + `iot-pipeline` venv optional):

  ```bash
  RUN_PIPELINE=1 SERIAL_PORT=/dev/ttyACM1 ./scripts/run-all.sh
  ```

---

## Quick Start (manual, separate terminals)

1. Start backend:
   - `cd backend`
   - `./venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000`
2. Start frontend:
   - `cd frontend`
   - `npm run dev`
3. (Optional) Start ingestion/training stack:
   - `cd iot-airflow`
   - `docker compose up -d` (Airflow only; no USB serial required)
   - To log from Arduino over USB when `/dev/ttyACM0` exists: `docker compose --profile serial up -d`
   - `cd ../iot-pipeline`
   - run your sensor ingestion script
4. Open:
   - Frontend: `http://127.0.0.1:5173`
   - API docs: `http://127.0.0.1:8000/docs`

## Notes

- Keep backend `.env` configured (`MONGO_URI`, `MONGO_DB`, `SECRET_KEY`, `MODEL_PATH`).
- Current frontend API base should point to `http://127.0.0.1:8000`.
- Airflow retraining is scheduled every 5 minutes, but actual retrain happens only if new rows since last model >= `MIN_NEW_ROWS_RETRAIN`.

## Why, where, hardware prototype, and product roadmap

For a report-ready explanation of **why** this platform exists, **where** it can deploy, how the **HC-SR04 + LEDs + buzzers** breadboard prototype supports a successful demo, **firmware logic** in words (no embedded source), and **future product** refinement, see:

- [`docs/PROTOTYPE_AND_PRODUCT.md`](docs/PROTOTYPE_AND_PRODUCT.md)
