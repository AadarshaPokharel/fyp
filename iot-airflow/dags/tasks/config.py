# """
# tasks/config.py
# ────────────────
# Single source of truth for all environment variables.
# """

# import os

# # ── MongoDB ────────────────────────────────────────────────
# MONGO_URI  = os.getenv("MONGO_URI",        "mongodb://localhost:27017")
# MONGO_DB   = os.getenv("MONGO_DB",         "iot_collision")
# MONGO_COLL = os.getenv("MONGO_COLLECTION", "iot_events")

# # ── CSV ────────────────────────────────────────────────────
# CSV_PATH   = os.getenv("CSV_PATH", "/opt/airflow/data/events.csv")

# # ── Snowflake ──────────────────────────────────────────────
# SF_ACCOUNT  = os.getenv("SNOWFLAKE_ACCOUNT")
# SF_USER     = os.getenv("SNOWFLAKE_USER")
# SF_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD")
# SF_WAREHOUSE= os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
# SF_DATABASE = os.getenv("SNOWFLAKE_DATABASE",  "IOT_COLLISION_DB")
# SF_SCHEMA   = os.getenv("SNOWFLAKE_SCHEMA",    "PUBLIC")

# # ── ML ─────────────────────────────────────────────────────
# MODEL_PATH      = "/opt/airflow/ml/model.pkl"
# MIN_ROWS_TRAIN  = 50
# BATCH_PRED_SIZE = 5000

# # ── Snowflake helpers ──────────────────────────────────────
# SF_REQUIRED = [SF_ACCOUNT, SF_USER, SF_PASSWORD]

# def snowflake_configured() -> bool:
#     return all(SF_REQUIRED)

# def get_snowflake_conn():
#     import snowflake.connector
#     return snowflake.connector.connect(
#         account   = SF_ACCOUNT,
#         user      = SF_USER,
#         password  = SF_PASSWORD,
#         warehouse = SF_WAREHOUSE,
#         database  = SF_DATABASE,
#         schema    = SF_SCHEMA,
#     )

# def get_mongo_client():
#     """Returns a MongoClient for Atlas connections."""
#     from pymongo import MongoClient
#     return MongoClient(
#         MONGO_URI,
#         serverSelectionTimeoutMS=30000,
#         connectTimeoutMS=30000,
#         socketTimeoutMS=30000,
#     )

"""
tasks/config.py
────────────────
Single source of truth for all environment variables.
"""

import os

# ── MongoDB ────────────────────────────────────────────────
MONGO_URI  = os.getenv("MONGO_URI",        "mongodb://localhost:27017")
MONGO_DB   = os.getenv("MONGO_DB",         "iot_collision")
MONGO_COLL = os.getenv("MONGO_COLLECTION", "iot_events")

# ── CSV ────────────────────────────────────────────────────
CSV_PATH   = os.getenv("CSV_PATH", "/opt/airflow/data/events.csv")

# ── Snowflake ──────────────────────────────────────────────
SF_ACCOUNT  = os.getenv("SNOWFLAKE_ACCOUNT")
SF_USER     = os.getenv("SNOWFLAKE_USER")
SF_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD")
SF_WAREHOUSE= os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SF_DATABASE = os.getenv("SNOWFLAKE_DATABASE",  "IOT_COLLISION_DB")
SF_SCHEMA   = os.getenv("SNOWFLAKE_SCHEMA",    "PUBLIC")

# ── ML ─────────────────────────────────────────────────────
MODEL_PATH             = "/opt/airflow/ml/model.pkl"
MIN_ROWS_TRAIN         = 50
MIN_NEW_ROWS_RETRAIN   = int(os.getenv("MIN_NEW_ROWS_RETRAIN", "200"))
BATCH_PRED_SIZE        = 5000
MONGO_PREDICTION_COLL  = os.getenv("MONGO_PREDICTION_COLLECTION", "predictions")

# ── Snowflake helpers ──────────────────────────────────────
SF_REQUIRED = [SF_ACCOUNT, SF_USER, SF_PASSWORD]

def snowflake_configured() -> bool:
    return all(SF_REQUIRED)

def get_snowflake_conn():
    import snowflake.connector
    return snowflake.connector.connect(
        account   = SF_ACCOUNT,
        user      = SF_USER,
        password  = SF_PASSWORD,
        warehouse = SF_WAREHOUSE,
        database  = SF_DATABASE,
        schema    = SF_SCHEMA,
    )

def get_mongo_client():
    """Returns a MongoClient for Atlas connections using certifi for SSL."""
    from pymongo import MongoClient
    import certifi
    return MongoClient(
        MONGO_URI,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000,
        socketTimeoutMS=30000,
    )