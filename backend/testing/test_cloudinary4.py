import asyncio
import cloudinary
import cloudinary.uploader
import cloudinary.utils
from app.core import config
import time
import urllib.request

cloudinary.config(
    cloud_name=config.CLOUDINARY_CLOUD_NAME,
    api_key=config.CLOUDINARY_API_KEY,
    api_secret=config.CLOUDINARY_API_SECRET,
    secure=True
)

url, _ = cloudinary.utils.cloudinary_url(
    "collisionguard/verification/test_pdf_123",
    sign_url=True,
    type="private",
    resource_type="image",
    expires_at=int(time.time() + 3600)
)
print("URL without extension:", url)
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)

