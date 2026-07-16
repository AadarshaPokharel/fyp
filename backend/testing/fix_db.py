import asyncio
from app.db import connection as db

async def main():
    await db.connect_to_mongo()
    db.init_collections(await db.get_database())
    
    # Find all policies without a valid _id (null)
    cursor = db.policies_collection.find({"_id": None})
    bad_docs = await cursor.to_list(length=100)
    print(f"Found {len(bad_docs)} bad documents with _id: null")
    
    if len(bad_docs) > 0:
        result = await db.policies_collection.delete_many({"_id": None})
        print(f"Deleted {result.deleted_count} bad documents")
        
if __name__ == "__main__":
    asyncio.run(main())
