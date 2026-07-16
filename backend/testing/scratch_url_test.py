import sys
sys.path.append("/home/aadarsha/fyp/backend")
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.services.storage_service import storage_service

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["collisionguard"]
    policy = await db.policies_collection.find_one(
        {"supporting_documents_file_id": {"$exists": True}}, 
        sort=[("created_at", -1)]
    )
    if not policy:
        print("No policy found.")
        return
        
    file_id = policy.get("supporting_documents_file_id")
    print(f"File ID: {file_id}")
    
    is_pdf = file_id.lower().endswith(".pdf")
    print(f"Is PDF: {is_pdf}")
    
    download_url = storage_service.generate_signed_url(file_id, resource_type="auto", attachment=not is_pdf)
    print(f"Download URL: {download_url}")

asyncio.run(main())
