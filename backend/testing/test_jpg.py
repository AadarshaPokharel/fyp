import asyncio
from app.services.storage_service import storage_service
import cloudinary.uploader
import cloudinary.utils
import urllib.request
import time

async def test():
    # 1x1 black pixel GIF disguised as JPG for testing
    img_content = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x01D\x00;'
    
    result = cloudinary.uploader.upload(
        img_content,
        folder="collisionguard/verification",
        public_id="test_img_123",
        overwrite=True,
        resource_type="image",
        type="private"
    )
    print("Uploaded as private:", result.get("public_id"))
    
    url, _ = cloudinary.utils.cloudinary_url(
        f"{result['public_id']}.jpg",
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
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)

asyncio.run(test())
