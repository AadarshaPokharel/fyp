"""
mongo_check.py
───────────────
Diagnoses and fixes MongoDB setup for the IoT collision project.
Checks connection, creates DB + collection + indexes if missing,
and inserts a test document to confirm writes work.

Usage:
    python mongo_check.py
    python mongo_check.py --uri mongodb://localhost:27017
"""

import argparse
import datetime
import sys
import os

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

# ── Check pymongo installed ────────────────────────────────────────────────────
try:
    from pymongo import MongoClient, ASCENDING
    from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
except ImportError:
    print("ERROR: pymongo not installed.")
    print("Fix:  pip install pymongo")
    sys.exit(1)


def check(label, fn):
    try:
        result = fn()
        print(f"  [OK]  {label}" + (f"  →  {result}" if result else ""))
        return True
    except Exception as e:
        print(f"  [FAIL] {label}  →  {e}")
        return False


def run(uri, db_name, col_name):
    print("\n=== IoT Collision — MongoDB Diagnostic ===\n")

    # ── 1. Connect ─────────────────────────────────────────────────────────────
    print(f"Connecting to:  {uri}")
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print("  [OK]  MongoDB reachable\n")
    except ServerSelectionTimeoutError:
        print(f"""
  [FAIL] Cannot reach MongoDB at {uri}

  Fix options:
  ─────────────────────────────────────────────────────────
  A) If using standalone scripts (live_pipeline.py):
       Install MongoDB locally:
         sudo apt update
         sudo apt install -y mongodb
         sudo systemctl start mongodb
         sudo systemctl enable mongodb

  B) If using Docker (iot-airflow):
         cd iot-airflow/
         docker compose up -d mongo
         # wait 10 seconds then run this script again

  C) If MongoDB is running but on a different port:
         python mongo_check.py --uri mongodb://localhost:27017
""")
        sys.exit(1)
    except ConnectionFailure as e:
        print(f"  [FAIL] Connection failed: {e}")
        sys.exit(1)

    # ── 2. Server info ─────────────────────────────────────────────────────────
    print("Server info:")
    info = client.server_info()
    print(f"  MongoDB version : {info.get('version', 'unknown')}")
    print(f"  Host            : {uri}\n")

    # ── 3. List existing databases ─────────────────────────────────────────────
    print("Existing databases:")
    dbs = client.list_database_names()
    for db in dbs:
        print(f"  - {db}")
    if db_name not in dbs:
        print(f"\n  NOTE: '{db_name}' does not exist yet — it will be created now.")
    print()

    # ── 4. Get or create DB + collection ──────────────────────────────────────
    db  = client[db_name]
    col = db[col_name]

    # ── 5. Create indexes ──────────────────────────────────────────────────────
    print("Creating indexes:")
    check("unique_reading index", lambda: col.create_index(
        [("timestamp_ms", 1), ("distA", 1), ("distB", 1)],
        unique=True, name="unique_reading"
    ))
    check("riskLevel index", lambda: col.create_index(
        "riskLevel", name="idx_risk"
    ))
    check("wall_time index", lambda: col.create_index(
        "wall_time", name="idx_wall_time"
    ))
    check("TTL safe-cleanup index", lambda: col.create_index(
        [("expires_at", ASCENDING)],
        expireAfterSeconds=0,
        name="ttl_safe_cleanup",
        sparse=True,
    ))
    print()

    # ── 6. Insert test document ────────────────────────────────────────────────
    print("Inserting test document:")
    test_doc = {
        "wall_time":     datetime.datetime.utcnow().isoformat(),
        "timestamp_ms":  0,
        "distA":         0.0,
        "distB":         0.0,
        "vehicleA":      False,
        "vehicleB":      False,
        "distanceDiff":  0.0,
        "speedA":        0.0,
        "approachingA":  False,
        "speedB":        0.0,
        "approachingB":  False,
        "avgSpeed":      0.0,
        "accelerationA": 0.0,
        "accelerationB": 0.0,
        "riskLevel":     0,
        "inserted_at":   datetime.datetime.utcnow(),
        "_test":         True,    # mark so we can delete it
    }
    result = col.insert_one(test_doc)
    print(f"  [OK]  Inserted test doc  _id={result.inserted_id}")

    # ── 7. Read it back ────────────────────────────────────────────────────────
    found = col.find_one({"_id": result.inserted_id})
    if found:
        print(f"  [OK]  Read back confirmed")
    else:
        print(f"  [FAIL] Could not read back test document")

    # ── 8. Delete test doc ─────────────────────────────────────────────────────
    col.delete_one({"_id": result.inserted_id})
    print(f"  [OK]  Test doc cleaned up\n")

    # ── 9. Final summary ───────────────────────────────────────────────────────
    total = col.count_documents({})
    indexes = list(col.index_information().keys())

    print("=== Summary ===")
    print(f"  Database   : {db_name}    [READY]")
    print(f"  Collection : {col_name}   [READY]")
    print(f"  Documents  : {total}")
    print(f"  Indexes    : {', '.join(indexes)}")
    print()
    print("MongoDB is set up correctly.")
    print("You can now run:  python live_pipeline.py")
    print()

    client.close()


def main():
    p = argparse.ArgumentParser(description="MongoDB diagnostic + setup")
    p.add_argument("--uri",        default=os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    p.add_argument("--db",         default="iot_collision")
    p.add_argument("--collection", default="iot_events")
    a = p.parse_args()
    run(a.uri, a.db, a.collection)


if __name__ == "__main__":
    main()