"""
serial_to_csv.py  (Airflow sidecar version)
─────────────────────────────────────────────
Runs as a Docker sidecar alongside Airflow.
Writes Arduino serial output → /data/events.csv continuously.
Airflow DAG picks up this file every 5 minutes.
"""

import argparse
import csv
import datetime
import os
import sys
import time
import serial

ARDUINO_COLS = [
    "timestamp", "distA", "distB", "vehicleA", "vehicleB",
    "distanceDiff", "speedA", "approachingA",
    "speedB", "approachingB", "avgSpeed", "riskLevel",
]
CSV_COLS         = ["wall_time"] + ARDUINO_COLS
HEADER_SIGNATURE = "timestamp,distA"


def is_valid(parts):
    if len(parts) != len(ARDUINO_COLS):
        return False
    try:
        int(parts[0]); float(parts[1]); float(parts[2])
    except ValueError:
        return False
    return True


def run(port, baud, out_path, quiet):
    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)

    print(f"Connecting to {port} @ {baud} baud …", flush=True)
    try:
        ser = serial.Serial(port, baud, timeout=2)
        time.sleep(2)
        ser.reset_input_buffer()
        print(f"Connected. Writing → {out_path}", flush=True)
    except serial.SerialException as e:
        print(f"ERROR: {e}", flush=True)
        sys.exit(1)

    rows = 0
    while True:
        try:
            raw  = ser.readline()
        except serial.SerialException as e:
            print(f"Serial error: {e}. Retrying…", flush=True)
            time.sleep(3)
            try:
                ser = serial.Serial(port, baud, timeout=2)
            except Exception:
                pass
            continue

        line  = raw.decode("utf-8", errors="ignore").strip()
        if not line or line.startswith(HEADER_SIGNATURE):
            continue

        parts = line.split(",")
        if not is_valid(parts):
            continue

        wall  = datetime.datetime.now().isoformat(timespec="milliseconds")
        write_header = not os.path.isfile(out_path) or os.path.getsize(out_path) == 0

        with open(out_path, "a", newline="") as f:
            w = csv.writer(f)
            if write_header:
                w.writerow(CSV_COLS)
            w.writerow([wall] + parts)

        rows += 1
        if not quiet:
            print(f"[{rows}] {wall}  A={parts[1]}cm B={parts[2]}cm risk={parts[11]}", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port",  default="/dev/ttyUSB0")
    p.add_argument("--baud",  default=9600, type=int)
    p.add_argument("--out",   default="/data/events.csv")
    p.add_argument("--quiet", action="store_true")
    a = p.parse_args()
    run(a.port, a.baud, a.out, a.quiet)