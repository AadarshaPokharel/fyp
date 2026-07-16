import asyncio
from app.services.storage_service import storage_service
import cloudinary.utils
import urllib.request
import time

async def test():
    base_id = "collisionguard/test/test_pdf_storage"
    format = "pdf"
    
    # Generate signature using base_id and format parameter!
    url, _ = cloudinary.utils.cloudinary_url(
        base_id,
        sign_url=True,
        type="private",
        resource_type="image",
        format=format,
        expires_at=int(time.time() + 3600)
    )
    print("Signed URL with format param:", url)
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)

asyncio.run(test())
