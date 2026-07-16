import asyncio, sys
sys.path.insert(0, '.')

async def check():
    from motor.motor_asyncio import AsyncIOMotorClient
    from app.core.config import MONGO_URI, MONGO_DB
    client = AsyncIOMotorClient(MONGO_URI, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=5000)
    db = client[MONGO_DB]
    
    user = await db["user"].find_one({"email": "aadarshapokharel3@gmail.com"})
    if user:
        print("Found user:")
        print("  role     :", repr(user.get("role")))
        print("  is_active:", user.get("is_active"))
        print("  username :", user.get("username"))
    else:
        print("USER NOT FOUND in 'user' collection")

asyncio.run(check())
