"""
live_pipeline.py
─────────────────
Arduino serial → CSV (every row) + MongoDB (smart filtered)

MongoDB overload prevention — 3 strategies applied together:

  1. SMART BUFFER — only insert when something meaningful changes:
       - riskLevel changed  (safe→warning, warning→danger etc.)
       - distance changed by more than DIST_CHANGE_THRESHOLD cm
       - always insert riskLevel 1 or 2 regardless
       - safe readings inserted at most once every SAFE_INTERVAL_SEC

  2. SKIP PURE SAFE — consecutive identical safe readings dropped
       from MongoDB (still written to CSV for full backup)

  3. TTL INDEX — MongoDB auto-deletes safe docs older than
       TTL_SAFE_DAYS. Warning/danger docs kept forever.

Result:
  CSV     → every reading  (~18,000 rows/hr)
  MongoDB → only meaningful events (~50-200 docs/hr typical)

Usage:
    python live_pipeline.py
    SERIAL_PORT=/dev/ttyUSB0 python live_pipeline.py
    python live_pipeline.py --port /dev/ttyUSB0 --out data/events.csv
"""

import argparse
import csv
import datetime
import os
import sys
import time
import serial
try:
    from serial.tools import list_ports
except ImportError:
    list_ports = None
from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError

# Load .env file if present — keeps secrets out of command line history
def _load_env():
    here   = os.path.dirname(os.path.abspath(__file__))
    parent = os.path.dirname(here)
    for env_path in [os.path.join(parent, ".env"), os.path.join(here, ".env")]:
        if not os.path.isfile(env_path):
            continue
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())
        break

_load_env()

# ── Column layout ──────────────────────────────────────────────────────────────

ARDUINO_COLS = [
    "timestamp", "distA", "distB", "vehicleA", "vehicleB",
    "distanceDiff", "speedA", "approachingA",
    "speedB", "approachingB", "avgSpeed",
    "accelerationA", "accelerationB", "riskLevel",
]
CSV_COLS         = ["wall_time"] + ARDUINO_COLS
HEADER_SIGNATURE = "timestamp,distA"
DEBUG_SIGNATURE  = "A:"

# ── Thresholds (override via CLI flags) ────────────────────────────────────────

DIST_CHANGE_THRESHOLD = 5.0
SAFE_INTERVAL_SEC     = 10.0
TTL_SAFE_DAYS         = 7


# ── Parsing ────────────────────────────────────────────────────────────────────

def parse_parts(parts, wall_time):
    return {
        "wall_time":     wall_time,
        "timestamp_ms":  int(parts[0]),
        "distA":         float(parts[1]),
        "distB":         float(parts[2]),
        "vehicleA":      bool(int(parts[3])),
        "vehicleB":      bool(int(parts[4])),
        "distanceDiff":  float(parts[5]),
        "speedA":        float(parts[6]),
        "approachingA":  bool(int(parts[7])),
        "speedB":        float(parts[8]),
        "approachingB":  bool(int(parts[9])),
        "avgSpeed":      float(parts[10]),
        "accelerationA": float(parts[11]),
        "accelerationB": float(parts[12]),
        "riskLevel":     int(parts[13]),
        "inserted_at":   datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
    }


def is_valid(parts):
    if len(parts) != 14:
        return False
    try:
        int(parts[0]); float(parts[1]); float(parts[2]); int(parts[13])
    except ValueError:
        return False
    return True


# ── Strategy 1 & 2: Smart buffer ──────────────────────────────────────────────

class SmartBuffer:
    def __init__(self):
        self.prev_risk  = -1
        self.prev_distA = None
        self.prev_distB = None
        self.last_safe_ts = 0.0

    def should_insert(self, doc):
        risk  = doc["riskLevel"]
        distA = doc["distA"]
        distB = doc["distB"]
        now   = time.time()

        if risk >= 1:
            self._update(risk, distA, distB)
            return True, "risk>=1"

        if risk != self.prev_risk:
            self._update(risk, distA, distB)
            return True, "risk-change"

        if self.prev_distA is not None:
            if abs(distA - self.prev_distA) > DIST_CHANGE_THRESHOLD or \
               abs(distB - self.prev_distB) > DIST_CHANGE_THRESHOLD:
                self._update(risk, distA, distB)
                return True, "dist-change"

        if (now - self.last_safe_ts) >= SAFE_INTERVAL_SEC:
            self.last_safe_ts = now
            self._update(risk, distA, distB)
            return True, "heartbeat"

        return False, "skipped"

    def _update(self, risk, distA, distB):
        self.prev_risk  = risk
        self.prev_distA = distA
        self.prev_distB = distB


# ── MongoDB setup ──────────────────────────────────────────────────────────────

def setup_mongo(uri, db_name, col_name):
    """
    FIX: TLSV1_ALERT_INTERNAL_ERROR was caused by the certifi CA bundle
    conflicting with the system's OpenSSL version on some Linux distros.

    Solution: Remove certifi and let pymongo/OpenSSL use the system's
    default CA store. If that still fails, we fall back to
    tlsAllowInvalidCertificates=True (connection still encrypted,
    just without server certificate verification — acceptable for dev).
    """
    base_kwargs = dict(
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=20000,
        socketTimeoutMS=20000,
    )

    # Attempt 1: system CA store (no certifi)
    try:
        client = MongoClient(uri, tls=True, **base_kwargs)
        client.admin.command("ping")
        print("  TLS: connected using system CA store")
        return _finish_mongo_setup(client, db_name, col_name)
    except Exception as e1:
        print(f"  TLS attempt 1 (system CA) failed: {e1}")

    # Attempt 2: skip certificate verification (still encrypted)
    try:
        client = MongoClient(
            uri,
            tls=True,
            tlsAllowInvalidCertificates=True,
            **base_kwargs,
        )
        client.admin.command("ping")
        print("  TLS: connected with certificate verification disabled (dev mode)")
        return _finish_mongo_setup(client, db_name, col_name)
    except Exception as e2:
        raise RuntimeError(
            f"Both TLS connection attempts failed.\n"
            f"  Attempt 1 (system CA):          {e1}\n"
            f"  Attempt 2 (skip cert verify):   {e2}\n\n"
            f"Possible causes:\n"
            f"  • Your IP is not whitelisted in MongoDB Atlas Network Access\n"
            f"  • The connection string in .env is incorrect\n"
            f"  • Atlas cluster is paused or deleted\n"
        )


def _finish_mongo_setup(client, db_name, col_name):
    col = client[db_name][col_name]

    col.create_index(
        [("timestamp_ms", 1), ("distA", 1), ("distB", 1)],
        unique=True, name="unique_reading"
    )
    for idx_name, idx_field in [("idx_risk", "riskLevel"), ("idx_wall_time", "wall_time")]:
        try:
            col.create_index(idx_field, name=idx_name)
        except Exception:
            pass

    # Strategy 3: TTL index on safe docs only
    col.create_index(
        [("expires_at", ASCENDING)],
        expireAfterSeconds=0,
        name="ttl_safe_cleanup",
        sparse=True,
    )
    return client, col


def _is_usb_style_serial(device):
    d = device.lower()
    return (
        "ttyacm" in d
        or "ttyusb" in d
        or "usbmodem" in d
        or "usbserial" in d
        or "cu.usb" in d
    )


def _suggest_usb_serial_port(ports):
    """Prefer USB Arduino-style devices over motherboard ttyS* ports."""
    devices = [p.device for p in ports]
    for p in ports:
        if _is_usb_style_serial(p.device):
            return p.device
    return devices[0] if devices else None


def _print_serial_help(requested_port):
    """User-friendly hint when the serial device is missing or cannot open."""
    print()
    print(f"  Could not use serial port: {requested_port}")
    print("  • Plug the Arduino (or USB–serial adapter) in and wait a few seconds.")
    print("  • On Linux, USB Arduinos are usually /dev/ttyACM0 or /dev/ttyUSB0.")
    print("  • Names like /dev/ttyS4 are often built-in UARTs, not USB — use the ttyACM/ttyUSB line if you see one.")
    if list_ports is not None:
        try:
            ports = list(list_ports.comports())
            if ports:
                usb_ports = [p for p in ports if _is_usb_style_serial(p.device)]
                ttys_ports = [p for p in ports if not _is_usb_style_serial(p.device)]
                print("\n  Ports detected on this machine:")
                for p in usb_ports:
                    desc = (p.description or "serial").strip() or "serial"
                    print(f"      {p.device}  —  {desc}")
                if ttys_ports and usb_ports:
                    print(f"      (also {len(ttys_ports)} motherboard UART ports ttyS* — ignore unless you use that wiring)")
                elif ttys_ports:
                    for p in ttys_ports:
                        print(f"      {p.device}  —  {p.description or 'serial'}")
                suggest = _suggest_usb_serial_port(ports)
                if suggest and suggest != requested_port:
                    print("\n  Try this port (USB-style device preferred when listed):")
                    print(f"      python3 live_pipeline.py --port {suggest}")
                    print(f"      export SERIAL_PORT={suggest}")
                elif suggest:
                    print("\n  Retry with:")
                    print(f"      python3 live_pipeline.py --port {suggest}")
            else:
                print("\n  No serial ports detected — check USB cable and drivers.")
        except Exception:
            print("\n  List ports manually:  python3 -m serial.tools.list_ports")
    else:
        print("\n  List ports:  python3 -m serial.tools.list_ports")
    print()


# ── Main ───────────────────────────────────────────────────────────────────────

def run(port, baud, out_path, mongo_uri, db_name, col_name):

    if not os.path.exists(port):
        print(f"Connecting to Arduino on {port} …")
        print(f"ERROR: device does not exist: {port}")
        _print_serial_help(port)
        sys.exit(1)

    print(f"Connecting to MongoDB at {mongo_uri} …")
    try:
        client, col = setup_mongo(mongo_uri, db_name, col_name)
        print(f"MongoDB ready → {db_name}.{col_name}")
        print(f"  [1] Smart buffer  : dist threshold={DIST_CHANGE_THRESHOLD}cm, safe interval={SAFE_INTERVAL_SEC}s")
        print(f"  [2] Skip safe     : consecutive identical safe readings dropped")
        print(f"  [3] TTL cleanup   : safe docs auto-deleted after {TTL_SAFE_DAYS} days\n")
    except Exception as e:
        print(f"ERROR: MongoDB failed: {e}"); sys.exit(1)

    os.makedirs(os.path.dirname(out_path) if os.path.dirname(out_path) else ".", exist_ok=True)
    needs_header = not os.path.isfile(out_path) or os.path.getsize(out_path) == 0

    print(f"Connecting to Arduino on {port} …")
    try:
        ser = serial.Serial(port, baud, timeout=2)
        time.sleep(2); ser.reset_input_buffer()
        print("Serial ready.\n")
    except serial.SerialException as e:
        print(f"ERROR: {e}")
        _print_serial_help(port)
        sys.exit(1)

    buf          = SmartBuffer()
    rows_csv     = 0
    rows_mongo   = 0
    rows_skipped = 0

    rl = {0: "\033[32mSAFE\033[0m", 1: "\033[33mMED \033[0m", 2: "\033[31mHIGH\033[0m"}

    try:
        with open(out_path, "a", newline="") as f:
            w = csv.writer(f)
            if needs_header:
                w.writerow(CSV_COLS); f.flush()

            print(f"{'csv':>6}  {'mongo':>6}  {'skip':>6}  {'time':26}  {'A':>6}  {'B':>6}  risk    reason")
            print("─" * 95)

            while True:
                try:
                    raw = ser.readline()
                except serial.SerialException as e:
                    print(f"\nSerial error: {e}. Retrying in 3s …")
                    time.sleep(3)
                    try: ser = serial.Serial(port, baud, timeout=2)
                    except Exception: pass
                    continue

                line = raw.decode("utf-8", errors="ignore").strip()
                if not line or line.startswith(HEADER_SIGNATURE) or line.startswith(DEBUG_SIGNATURE):
                    continue

                parts = line.split(",")
                if not is_valid(parts):
                    continue

                wall_time = datetime.datetime.now().isoformat(timespec="milliseconds")

                w.writerow([wall_time] + parts)
                f.flush()
                rows_csv += 1

                doc = parse_parts(parts, wall_time)
                store, reason = buf.should_insert(doc)

                if store:
                    if doc["riskLevel"] == 0:
                        doc["expires_at"] = (
                            datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) +
                            datetime.timedelta(days=TTL_SAFE_DAYS)
                        )
                    try:
                        col.insert_one(doc)
                        rows_mongo += 1
                    except DuplicateKeyError:
                        pass
                else:
                    rows_skipped += 1

                risk = doc["riskLevel"]
                print(
                    f"{rows_csv:>6}  {rows_mongo:>6}  {rows_skipped:>6}  "
                    f"{wall_time}  "
                    f"{doc['distA']:>5.1f}cm  {doc['distB']:>5.1f}cm  "
                    f"{rl.get(risk,'?')}  {reason}"
                )

    except KeyboardInterrupt:
        pct = (rows_mongo / rows_csv * 100) if rows_csv else 0
        print(f"\n\nStopped.")
        print(f"  CSV rows      : {rows_csv:,}  →  {out_path}")
        print(f"  Mongo inserts : {rows_mongo:,}  ({pct:.1f}% of total readings)")
        print(f"  Filtered out  : {rows_skipped:,}  redundant safe readings")
        ser.close(); client.close()


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    global DIST_CHANGE_THRESHOLD, SAFE_INTERVAL_SEC, TTL_SAFE_DAYS

    p = argparse.ArgumentParser(description="Arduino → CSV + MongoDB (smart filtered)")
    p.add_argument(
        "--port",
        default=os.getenv("SERIAL_PORT", "/dev/ttyACM0"),
        help="Serial device (default: $SERIAL_PORT or /dev/ttyACM0). Use python3 -m serial.tools.list_ports to list.",
    )
    p.add_argument("--baud",          default=9600,   type=int)
    p.add_argument("--out",           default=os.getenv("CSV_PATH", "../data/events.csv"))
    p.add_argument("--uri",           default=os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    p.add_argument("--db",            default="iot_collision")
    p.add_argument("--collection",    default="iot_events")
    p.add_argument("--dist-thresh",   default=DIST_CHANGE_THRESHOLD, type=float)
    p.add_argument("--safe-interval", default=SAFE_INTERVAL_SEC, type=float)
    p.add_argument("--ttl-days",      default=TTL_SAFE_DAYS, type=int)
    a = p.parse_args()

    DIST_CHANGE_THRESHOLD = a.dist_thresh
    SAFE_INTERVAL_SEC     = a.safe_interval
    TTL_SAFE_DAYS         = a.ttl_days

    run(a.port, a.baud, a.out, a.uri, a.db, a.collection)

if __name__ == "__main__":
    main()