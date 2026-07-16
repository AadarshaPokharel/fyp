import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv(".env")
load_dotenv("../.env")

async def migrate():
    client = AsyncIOMotorClient(os.getenv("MONGO_URI"), tlsAllowInvalidCertificates=True)
    db = client[os.getenv("MONGO_DB", "iot_collision")]

    # Find users with Base64 profile pictures (they start with "data:image")
    users = await db.user.find({
        "profile.profile_picture": {"$regex": "^data:image"}
    }).to_list(None)

    print(f"Found {len(users)} users with Base64 profile pictures")

    for user in users:
        # Clear the Base64 — user will need to re-upload
        await db.user.update_one(
            {"_id": user["_id"]},
            {"$set": {"profile.profile_picture": None}}
        )
        print(f"Cleared avatar for: {user['username']}")

    print("Migration complete")
    client.close()

asyncio.run(migrate())
