"""
tasks/check_csv.py — Task 1
Verifies the CSV file exists and has data rows.
"""

import csv
import logging
from pathlib import Path
from tasks.config import CSV_PATH

log = logging.getLogger(__name__)


def check_csv_has_new_data() -> int:
    p = Path(CSV_PATH)
    if not p.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")
    with open(CSV_PATH, newline="") as f:
        rows = sum(1 for _ in csv.reader(f)) - 1
    if rows <= 0:
        raise ValueError("CSV is empty — nothing to do.")
    log.info(f"CSV has {rows} data rows.")
    return rows