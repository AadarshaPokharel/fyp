# backend/app/db/connection.py
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from app.core.config import MONGO_URI, MONGO_DB
import certifi

# Create async MongoDB client
_client: AsyncIOMotorClient = None


async def get_database() -> AsyncIOMotorDatabase:
    """Get MongoDB database instance."""
    return _client[MONGO_DB]


async def connect_to_mongo():
    """Connect to MongoDB Atlas."""
    global _client
    _client = AsyncIOMotorClient(
        MONGO_URI,
        tls=True,
        # tlsCAFile=certifi.where(),
        tlsAllowInvalidCertificates=True,  # Relaxed for environment compatibility
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=20000,
        socketTimeoutMS=20000,
    )
    # Verify connection
    await _client.admin.command("ping")
    print(f"✓ Connected to MongoDB: {MONGO_DB}")


async def close_mongo_connection():
    """Close MongoDB connection."""
    global _client
    if _client:
        _client.close()
        print("✓ Closed MongoDB connection")


# Collection references (Aligned with User requested names)
iot_events_collection: AsyncIOMotorCollection = None
predictions_collection: AsyncIOMotorCollection = None
users_collection: AsyncIOMotorCollection = None       # mapped to 'user'
audit_logs_collection: AsyncIOMotorCollection = None  # mapped to 'audit_logs'
download_requests_collection: AsyncIOMotorCollection = None  # mapped to 'downloadrequests'
roles_collection: AsyncIOMotorCollection = None       # mapped to 'userrole'
pm_verification_requests_collection: AsyncIOMotorCollection = None  # mapped to 'pmverificationrequests'
policies_collection: AsyncIOMotorCollection = None  # mapped to 'policies'


async def init_collections():
    """Initialize collection references and create all indexes after connecting.

    All create_index calls are idempotent — MongoDB silently skips indexes
    whose name already exists with the same definition.
    """
    global iot_events_collection, predictions_collection, users_collection, \
           audit_logs_collection, download_requests_collection, roles_collection, \
           pm_verification_requests_collection, policies_collection
    db = await get_database()

    from pymongo import ASCENDING, DESCENDING

    # ── Bind collections ──────────────────────────────────────────────────────
    iot_events_collection        = db["iot_events"]
    predictions_collection       = db["predictions"]
    users_collection             = db["user"]
    audit_logs_collection        = db["audit_logs"]
    download_requests_collection = db["downloadrequests"]
    roles_collection             = db["userrole"]
    pm_verification_requests_collection = db["pmverificationrequests"]
    policies_collection          = db["policies"]

    # ── 1. users indexes ──────────────────────────────────────────────────────
    await users_collection.create_index(
        [("username", ASCENDING)], unique=True, name="idx_username"
    )
    # Sparse: only documents that actually have these fields are indexed
    await users_collection.create_index(
        "setup_token_hash", sparse=True, name="idx_setup_token"
    )
    await users_collection.create_index(
        "reset_token_hash", sparse=True, name="idx_reset_token"
    )
    await users_collection.create_index(
        "last_login_at", sparse=True, name="idx_last_login"
    )

    # ── 2. iot_events indexes ─────────────────────────────────────────────────
    # Prevent duplicate readings from the real-time pipeline
    await iot_events_collection.create_index(
        [("timestamp_ms", ASCENDING), ("distA", ASCENDING), ("distB", ASCENDING)],
        unique=True,
        name="unique_reading",
    )
    # Supports /events/timeseries, /events/stats, /events/recent
    await iot_events_collection.create_index(
        [("riskLevel", ASCENDING), ("wall_time", DESCENDING)],
        name="risk_time_compound",
    )
    await iot_events_collection.create_index(
        [("wall_time", DESCENDING)],
        name="wall_time_desc",
    )

    # ── 3. predictions indexes ────────────────────────────────────────────────
    # One prediction per event (enforced at DB level)
    await predictions_collection.create_index(
        "event_id", unique=True, name="idx_event_unique"
    )
    await predictions_collection.create_index(
        [("scored_at", DESCENDING)], name="idx_scored_at"
    )

    # ── 4. audit_logs indexes ─────────────────────────────────────────────────
    await audit_logs_collection.create_index(
        [("user_id", ASCENDING), ("timestamp", DESCENDING)],
        name="user_audit_compound",
    )
    await audit_logs_collection.create_index(
        [("action", ASCENDING), ("timestamp", DESCENDING)],
        name="action_time_compound",
    )
    # Auto-expire audit log documents after 90 days
    await audit_logs_collection.create_index(
        "timestamp",
        expireAfterSeconds=60 * 60 * 24 * 90,  # 90 days
        name="audit_ttl",
    )

    # ── 5. download_requests indexes ──────────────────────────────────────────
    # Policy maker "my requests" view
    await download_requests_collection.create_index(
        [("user_id", ASCENDING), ("status", ASCENDING)],
        name="user_status_compound",
    )
    # Admin approval queue (pending first, newest first)
    await download_requests_collection.create_index(
        [("status", ASCENDING), ("created_at", DESCENDING)],
        name="status_created_compound",
    )

    await roles_collection.create_index(
        [("name", ASCENDING)], unique=True, name="idx_role"
    )

    # ── 6. pm_verification_requests indexes ──────────────────────────────────
    await pm_verification_requests_collection.create_index(
        [("email", ASCENDING)], unique=True, name="idx_pm_email"
    )
    await pm_verification_requests_collection.create_index(
        "token", sparse=True, name="idx_pm_token"
    )
    await pm_verification_requests_collection.create_index(
        [("status", ASCENDING)], name="idx_pm_status"
    )
    await pm_verification_requests_collection.create_index(
        "token_expires_at", sparse=True, name="idx_pm_token_expiry"
    )

    # ── 7. policies indexes ───────────────────────────────────────────────────
    await policies_collection.create_index(
        [("owner_id", ASCENDING), ("status", ASCENDING)],
        name="idx_policy_owner_status"
    )
    await policies_collection.create_index(
        [("status", ASCENDING), ("updated_at", DESCENDING)],
        name="idx_policy_status_updated"
    )

    # ── token_denylist index ──────────────────────────────────────────────────
    token_denylist = db["token_denylist"]
    await token_denylist.create_index("expires_at", expireAfterSeconds=0, name="token_ttl")

    print("✓ Collections & indexes initialized")
