import asyncio
from app.services.storage_service import storage_service
import cloudinary.utils
import urllib.request
import time

async def test():
    # We already have test_pdf_123 uploaded as a PDF
    url, _ = cloudinary.utils.cloudinary_url(
        "collisionguard/verification/test_pdf_123.jpg",
        sign_url=True,
        type="private",
        resource_type="image",
        expires_at=int(time.time() + 3600)
    )
    print("Signed URL:", url)
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
            print("Content-Type:", response.headers.get("Content-Type"))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)

asyncio.run(test())
