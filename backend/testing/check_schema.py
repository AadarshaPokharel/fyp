import asyncio
import motor.motor_asyncio
import os
import sys

# Get MONGO_URI and MONGO_DB from environment or config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from app.core.config import MONGO_URI, MONGO_DB
except ImportError:
    MONGO_URI = os.getenv("MONGO_URI")
    MONGO_DB = os.getenv("MONGO_DB")

async def main():
    if not MONGO_URI:
        print("MONGO_URI not found.")
        return
        
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGO_URI, 
        tls=True, 
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=5000
    )
    db = client[MONGO_DB]
    
    collections = await db.list_collection_names()
    print(f"Collections: {collections}")
    
    for c in ["iot_event", "iot_events"]:
        if c in collections:
            doc = await db[c].find_one()
            count = await db[c].count_documents({})
            print(f"\n--- {c} (Count: {count}) ---")
            print(f"Schema: {list(doc.keys()) if doc else 'Empty'}")
            print(f"Sample: {doc}")
        else:
            print(f"\n--- {c} (Not Found) ---")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(main())
