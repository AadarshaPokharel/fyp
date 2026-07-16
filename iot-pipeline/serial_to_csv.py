"""
serial_to_csv.py
─────────────────
Reads serial output from the Arduino ( /dev/ttyACM0) and appends
each CSV row to a file with a real wall-clock timestamp prepended.

Arduino serial output has TWO line types per loop() call:
  1. DEBUG line  → "A:0 B:1 diff:5 speed:3.20 risk:2"   ← skipped
  2. CSV line    → "1400,8,11,1,1,3,3.20,1,3.20,1,3.20,1.50,1.20,2"  ← kept

CSV columns (14 total from Arduino):
  timestamp, distA, distB, vehicleA, vehicleB, distanceDiff,
  speedA, approachingA, speedB, approachingB, avgSpeed,
  accelerationA, accelerationB, riskLevel

Output CSV adds one column at the front:
  wall_time  — ISO-8601 timestamp from the host PC

Usage:
    python serial_to_csv.py
    python serial_to_csv.py --port  /dev/ttyACM0 --baud 9600 --out data/events.csv
"""

import argparse
import csv
import datetime
import os
import sys
import time
import serial

# ── Column definitions ─────────────────────────────────────────────────────────

ARDUINO_COLS = [
    "timestamp",       # millis()
    "distA",           # smoothed distance sensor A (cm)
    "distB",           # smoothed distance sensor B (cm)
    "vehicleA",        # 0 or 1
    "vehicleB",        # 0 or 1
    "distanceDiff",    # abs(distA - distB)
    "speedA",          # cm/s toward sensor A
    "approachingA",    # 0 or 1
    "speedB",          # cm/s toward sensor B
    "approachingB",    # 0 or 1
    "avgSpeed",        # (speedA + speedB) / 2
    "accelerationA",   # cm/s²
    "accelerationB",   # cm/s²
    "riskLevel",       # 0=safe 1=medium 2=high
]

CSV_COLS         = ["wall_time"] + ARDUINO_COLS   # 15 columns total in output file
EXPECTED_COLS    = len(ARDUINO_COLS)              # 14
HEADER_SIGNATURE = "timestamp,distA"              # first two tokens of Arduino header
DEBUG_SIGNATURE  = "A:"                           # debug lines always start with "A:"


# ── Filters ────────────────────────────────────────────────────────────────────

def is_header(line: str) -> bool:
    return line.startswith(HEADER_SIGNATURE)

def is_debug(line: str) -> bool:
    return line.startswith(DEBUG_SIGNATURE)

def is_valid_csv(parts: list[str]) -> bool:
    if len(parts) != EXPECTED_COLS:
        return False
    try:
        int(parts[0])    # timestamp must be integer
        float(parts[1])  # distA numeric
        float(parts[2])  # distB numeric
        int(parts[13])   # riskLevel must be 0/1/2
    except ValueError:
        return False
    return True


# ── CSV write helper ───────────────────────────────────────────────────────────

def csv_needs_header(path: str) -> bool:
    return not os.path.isfile(path) or os.path.getsize(path) == 0


# ── Main ───────────────────────────────────────────────────────────────────────

def run(port: str, baud: int, out_path: str, quiet: bool):
    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)

    print(f"Connecting to {port} @ {baud} baud …")
    try:
        ser = serial.Serial(port, baud, timeout=2)
        time.sleep(2)          # wait for Arduino reset
        ser.reset_input_buffer()
        print(f"Connected.  Logging → {out_path}")
        print("Press Ctrl+C to stop.\n")
    except serial.SerialException as e:
        print(f"ERROR: Cannot open {port}: {e}")
        sys.exit(1)

    risk_label = {0: "\033[32mSAFE\033[0m", 1: "\033[33mMED \033[0m", 2: "\033[31mHIGH\033[0m"}
    rows = 0

    try:
        while True:
            try:
                raw = ser.readline()
            except serial.SerialException as e:
                print(f"\nSerial error: {e}. Reconnecting in 3 s …")
                time.sleep(3)
                try:
                    ser = serial.Serial(port, baud, timeout=2)
                except Exception:
                    pass
                continue

            line = raw.decode("utf-8", errors="ignore").strip()

            if not line:
                continue
            if is_header(line) or is_debug(line):
                continue                           # silently drop both

            parts = line.split(",")
            if not is_valid_csv(parts):
                if not quiet:
                    print(f"[skip] {line}")
                continue

            wall_time = datetime.datetime.now().isoformat(timespec="milliseconds")

            write_hdr = csv_needs_header(out_path)
            with open(out_path, "a", newline="") as f:
                w = csv.writer(f)
                if write_hdr:
                    w.writerow(CSV_COLS)
                w.writerow([wall_time] + parts)

            rows += 1
            if not quiet:
                risk = int(parts[13])
                print(
                    f"[{rows:>5}]  {wall_time}"
                    f"  A={float(parts[1]):>6.1f}cm"
                    f"  B={float(parts[2]):>6.1f}cm"
                    f"  accA={float(parts[11]):>6.2f}"
                    f"  accB={float(parts[12]):>6.2f}"
                    f"  {risk_label.get(risk, '???')}"
                )

    except KeyboardInterrupt:
        print(f"\nStopped.  {rows} rows written → {out_path}")
        ser.close()


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Arduino Serial → CSV Logger")
    p.add_argument("--port",  default=" /dev/ttyACM0")
    p.add_argument("--baud",  default=9600, type=int)
    p.add_argument("--out",   default="data/events.csv")
    p.add_argument("--quiet", action="store_true")
    a = p.parse_args()
    run(a.port, a.baud, a.out, a.quiet)

if __name__ == "__main__":
    main()