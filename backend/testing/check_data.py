import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

async def check():
    load_dotenv()
    uri = os.getenv("MONGO_URI")
    db_name = os.getenv("MONGO_DB")
    
    if not uri:
        print("MONGO_URI not found")
        return

    print(f"Connecting to {db_name}...")
    client = AsyncIOMotorClient(uri, tls=True, tlsAllowInvalidCertificates=True)
    db = client[db_name]
    doc = await db["iot_events"].find_one()
    print("Record Sample:")
    print(doc)
    if doc:
        for k, v in doc.items():
            print(f"{k}: {type(v)}")
    client.close()

if __name__ == "__main__":
    asyncio.run(check())
