# backend/app/db/__init__.py
"""
Database package providing dynamic access to initialized collection references.
"""
from . import connection

# Collection names that can be accessed dynamically from connection.py
COLLECTIONS = [
    "iot_events_collection",
    "predictions_collection",
    "users_collection",
    "audit_logs_collection",
    "download_requests_collection",
    "roles_collection",
    "pm_verification_requests_collection",
    "policies_collection",
]

def __getattr__(name: str):
    """
    Allow dynamic access to collection variables in connection.py.
    This prevents stale NoneType references in services that import app.db.
    """
    if name in COLLECTIONS:
        return getattr(connection, name)
    if name == "get_database":
        return connection.get_database
    raise AttributeError(f"module {__name__} has no attribute {name}")

__all__ = COLLECTIONS + ["get_database"]
