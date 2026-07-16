#!/usr/bin/env bash
# Start Airflow (Docker) + backend API + frontend dev server in one terminal.
# Press Ctrl+C to stop local processes; set RUN_ALL_DOCKER_DOWN=0 to leave Docker running.
#
# If you see "address already in use" on port 8000: another backend is still running.
#   RUN_ALL_FREE_PORTS=1 ./scripts/run-all.sh
#
# To always auto-clear ports without the flag:
#   RUN_ALL_AUTO_CLEAR=1 ./scripts/run-all.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AIRFLOW_COMPOSE="$ROOT/iot-airflow/docker-compose.yml"

BACKEND_PID=""
FRONTEND_PID=""
PIPELINE_PID=""

cleanup() {
  echo ""
  echo "[run-all] Stopping local processes..."
  [[ -n "${BACKEND_PID}" ]] && kill "${BACKEND_PID}" 2>/dev/null || true
  [[ -n "${FRONTEND_PID}" ]] && kill "${FRONTEND_PID}" 2>/dev/null || true
  [[ -n "${PIPELINE_PID}" ]] && kill "${PIPELINE_PID}" 2>/dev/null || true
  wait 2>/dev/null || true
  if [[ "${RUN_ALL_DOCKER_DOWN:-1}" == "1" ]]; then
    echo "[run-all] Stopping Docker Compose (iot-airflow)..."
    docker compose -f "$AIRFLOW_COMPOSE" down 2>/dev/null || true
  else
    echo "[run-all] Leaving Docker containers running (RUN_ALL_DOCKER_DOWN=0)."
  fi
}

trap cleanup EXIT INT TERM

_port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :${port} )" 2>/dev/null | grep -q LISTEN
  elif command -v lsof >/dev/null 2>&1; then
    lsof -i:"${port}" -sTCP:LISTEN -t >/dev/null 2>&1
  else
    return 1
  fi
}

_free_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti:"${port}" -sTCP:LISTEN 2>/dev/null || true)
    [[ -n "${pids}" ]] && kill ${pids} 2>/dev/null || true
  fi
}

echo "[run-all] Project root: $ROOT"

# ── Auto-clear ports 8000 / 5173 before starting ──────────────────────────────
# Triggered by either RUN_ALL_FREE_PORTS=1 (original flag, kept for compatibility)
# or RUN_ALL_AUTO_CLEAR=1 (new permanent flag you can export in your shell profile)
if [[ "${RUN_ALL_FREE_PORTS:-0}" == "1" || "${RUN_ALL_AUTO_CLEAR:-0}" == "1" ]]; then
  echo "[run-all] Auto-clearing ports 8000 and 5173..."
  _free_port 8000
  _free_port 5173
  sleep 1
  echo "[run-all] Ports cleared."
fi

# ── Port conflict check ────────────────────────────────────────────────────────
# If auto-clear was not used, warn the user clearly with instructions
for need_port in 8000 5173; do
  if _port_listening "${need_port}"; then
    echo ""
    echo "ERROR: Port ${need_port} is already in use (another backend/frontend or old run)."
    if command -v ss >/dev/null 2>&1; then
      ss -ltnp "( sport = :${need_port} )" 2>/dev/null || true
    fi
    echo ""
    echo "Quick fixes:"
    echo "  1. Auto-clear and restart:  RUN_ALL_FREE_PORTS=1 ./scripts/run-all.sh"
    echo "  2. Kill port manually:      kill \$(lsof -ti:${need_port})"
    echo "  3. Kill with fuser:         fuser -k ${need_port}/tcp"
    echo "  4. Add to your ~/.bashrc to always auto-clear:"
    echo "     export RUN_ALL_AUTO_CLEAR=1"
    echo ""
    exit 1
  fi
done

# --- Docker: Airflow + Postgres (no USB serial service — avoids missing /dev/ttyACM0) ---
echo "[run-all] Starting iot-airflow (Docker)..."
docker compose -f "$AIRFLOW_COMPOSE" up -d

echo "[run-all] Waiting for services to settle (8s)..."
sleep 8

# --- Backend ---
if [[ ! -x "$ROOT/backend/venv/bin/python" ]]; then
  echo "ERROR: backend venv missing. Run: cd backend && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "[run-all] Starting backend on http://127.0.0.1:8000 ..."
(
  cd "$ROOT/backend"
  exec ./venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
) &
BACKEND_PID=$!

# --- Frontend ---
if [[ ! -f "$ROOT/frontend/package.json" ]]; then
  echo "ERROR: frontend not found."
  exit 1
fi

echo "[run-all] Starting frontend (Vite)..."
(
  cd "$ROOT/frontend"
  exec npm run dev -- --host 127.0.0.1
) &
FRONTEND_PID=$!

# --- Optional: live pipeline (Arduino → Mongo + CSV). Set RUN_PIPELINE=1 ---
if [[ "${RUN_PIPELINE:-0}" == "1" ]]; then
  PORT="${SERIAL_PORT:-}"
  if [[ -z "$PORT" ]]; then
    for p in /dev/ttyACM0 /dev/ttyACM1 /dev/ttyUSB0; do
      [[ -e "$p" ]] && PORT="$p" && break
    done
  fi
  if [[ -z "$PORT" || ! -e "$PORT" ]]; then
    echo "[run-all] RUN_PIPELINE=1 but no serial port found. Set SERIAL_PORT=/dev/ttyACM1 (or plug Arduino). Skipping pipeline."
  else
    echo "[run-all] Starting live_pipeline.py on $PORT ..."
    (
      cd "$ROOT/iot-pipeline"
      if [[ -x venv/bin/python ]]; then
        exec env SERIAL_PORT="$PORT" venv/bin/python live_pipeline.py --port "$PORT"
      else
        exec env SERIAL_PORT="$PORT" python3 live_pipeline.py --port "$PORT"
      fi
    ) &
    PIPELINE_PID=$!
  fi
fi

echo ""
echo "==================================================================="
echo "  All core services are running"
echo "  • Frontend:     http://127.0.0.1:5173"
echo "  • Backend API:  http://127.0.0.1:8000/docs"
echo "  • Airflow UI:   http://127.0.0.1:8080"
if [[ -n "${PIPELINE_PID}" ]]; then
  echo "  • Live pipeline: serial → CSV + Mongo (PID $PIPELINE_PID)"
fi
echo ""
echo "  PIDs: backend=$BACKEND_PID  frontend=$FRONTEND_PID"
echo "  Press Ctrl+C to stop backend/frontend (and Docker unless RUN_ALL_DOCKER_DOWN=0)."
echo "==================================================================="
echo ""

wait