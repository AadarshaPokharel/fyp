"""
tasks/cleanup_orphan_predictions.py
─────────────────────────────────────
Task: cleanup_orphan_predictions

Deletes any document in the `predictions` collection whose `event_id`
no longer has a matching document in `iot_events`.

This can happen when:
  - Safe IoT events are TTL-expired from `iot_events` after 7 days
  - Events are manually removed during development/debugging
  - A migration leaves stale prediction records behind

The task runs after `batch_predict` so that the newly scored events are
already in `predictions` before the orphan check, and before `health_check`
so that the health metrics reflect a consistent state.

Returns the number of orphan prediction documents deleted.
"""

import logging

from tasks.config import MONGO_URI, MONGO_DB, MONGO_COLL, MONGO_PREDICTION_COLL

log = logging.getLogger(__name__)


def run_cleanup_orphan_predictions(scored: int) -> int:
    """Remove predictions that reference non-existent iot_events documents.

    Args:
        scored: Number of events scored in the current batch_predict run
                (passed through for dependency chaining in the DAG).

    Returns:
        Number of orphan prediction documents deleted.
    """
    try:
        from tasks.config import get_mongo_client

        client = get_mongo_client()
        db = client[MONGO_DB]

        events_col      = db[MONGO_COLL]
        predictions_col = db[MONGO_PREDICTION_COLL]

        # Collect all valid event _ids (may be large; use a set for O(1) look-up)
        existing_event_ids = events_col.distinct("_id")

        if not existing_event_ids:
            # If there are no events at all, do NOT delete everything —
            # this likely means MongoDB is unreachable or the collection is
            # genuinely empty (e.g. first run). Skip to be safe.
            log.warning(
                "iot_events.distinct('_id') returned an empty list. "
                "Skipping orphan cleanup to avoid accidental mass delete."
            )
            client.close()
            return 0

        result = predictions_col.delete_many(
            {"event_id": {"$nin": existing_event_ids}}
        )
        deleted = result.deleted_count

        if deleted:
            log.info(f"Orphan cleanup: deleted {deleted} stale prediction(s).")
        else:
            log.info("Orphan cleanup: no stale predictions found.")

        client.close()
        return deleted

    except Exception as exc:
        log.warning(f"Orphan prediction cleanup failed: {exc}")
        return 0


# ─────────────────────────────────────────────────────────────
# Run standalone (for manual testing outside Airflow)
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    deleted = run_cleanup_orphan_predictions(scored=0)
    print(f"Deleted {deleted} orphan prediction(s)")
