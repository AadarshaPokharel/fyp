import asyncio
import motor.motor_asyncio
import os
import sys

# Add backend to path to import config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from app.core.config import MONGO_URI, MONGO_DB
except ImportError:
    MONGO_URI = os.getenv("MONGO_URI")
    MONGO_DB = os.getenv("MONGO_DB")

async def migrate():
    print(f"Connecting to {MONGO_DB}...")
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGO_URI, 
        tls=True, 
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=5000
    )
    db = client[MONGO_DB]
    
    events_col = db["iot_events"]
    preds_col = db["predictions"]
    
    # Found in research: 1,267 docs have these fields
    query = {"collision_prob": {"$exists": True}}
    cursor = events_col.find(query)
    
    migrated_count = 0
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
        
        # 1. Check if prediction already exists to avoid dupes
        exists = await preds_col.find_one({"event_id": event_id})
        if not exists:
            # 2. Insert into predictions
            prediction_doc = {
                "event_id": event_id,
                "collision_prob": normalize_collision_prob(
                    event.get("collision_prob", 0.0),
                    event.get("predicted_risk", 0),
                ),
                "predicted_risk": event.get("predicted_risk", 0),
                "scored_at": event.get("scored_at") or event.get("inserted_at")
            }
            await preds_col.insert_one(prediction_doc)
            migrated_count += 1
        
        # 3. Remove from iot_events (Cleanup)
        await events_col.update_one(
            {"_id": event_id},
            {"$unset": {"collision_prob": "", "predicted_risk": "", "scored_at": ""}}
        )

    print(f"✓ Migration Complete: {migrated_count} records moved to 'predictions'.")
    print(f"✓ Cleanup Complete: ML columns removed from 'iot_events'.")
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate())
