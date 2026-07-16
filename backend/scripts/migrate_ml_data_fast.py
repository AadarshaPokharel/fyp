import asyncio
import motor.motor_asyncio
import os
import sys
from pymongo import InsertOne, UpdateOne

# Add backend to path to import config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from app.core.config import MONGO_URI, MONGO_DB
except ImportError:
    MONGO_URI = os.getenv("MONGO_URI")
    MONGO_DB = os.getenv("MONGO_DB")

async def migrate():
    print(f"Connecting to {MONGO_DB} for bulk migration...")
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGO_URI, 
        tls=True, 
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=5000
    )
    db = client[MONGO_DB]
    
    events_col = db["iot_events"]
    preds_col = db["predictions"]
    
    # Target fields (the 'last 3 columns' as requested)
    ml_fields = ["collision_prob", "predicted_risk", "scored_at"]
    
    query = {"collision_prob": {"$exists": True}}
    cursor = events_col.find(query)
    
    insert_ops = []
    unset_ops = []
    count = 0
    
    def normalize_collision_prob(value, predicted_risk):
        if isinstance(value, list) and len(value) == 3:
            return value
        if isinstance(value, (int, float)):
            try:
                idx = int(predicted_risk)
                if 0 <= idx < 3:
                    result = [0.0, 0.0, 0.0]
                    result[idx] = float(value)
                    return result
            except Exception:
                pass
            return [float(value), 0.0, 0.0]
        return [0.0, 0.0, 0.0]

    async for event in cursor:
        event_id = event["_id"]
        
        # 1. Prepare insertion only if not already there
        # Bulk checking is hard, but we can use UpdateOne with upsert for predictions
        insert_ops.append(UpdateOne(
            {"event_id": event_id},
            {
                "$set": {
                    "collision_prob": normalize_collision_prob(
                        event.get("collision_prob", 0.0),
                        event.get("predicted_risk", 0),
                    ),
                    "predicted_risk": event.get("predicted_risk", 0),
                    "scored_at": event.get("scored_at") or event.get("inserted_at")
                }
            },
            upsert=True
        ))
        
        # 2. Prepare unsetting
        unset_ops.append(UpdateOne(
            {"_id": event_id},
            {"$unset": {f: "" for f in ml_fields}}
        ))
        
        count += 1
        if len(insert_ops) >= 100:
            await preds_col.bulk_write(insert_ops)
            await events_col.bulk_write(unset_ops)
            insert_ops = []
            unset_ops = []
            print(f"Migrated {count} records...")

    # Final batch
    if insert_ops:
        await preds_col.bulk_write(insert_ops)
        await events_col.bulk_write(unset_ops)

    print(f"✓ Bulk Migration Complete: {count} total records processed.")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
