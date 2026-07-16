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

print("Test 3: Fetching with fl_attachment")
url_att, _ = cloudinary.utils.cloudinary_url(
    "collisionguard/verification/test_pdf_123",
    format="pdf",
    sign_url=True,
    type="private",
    resource_type="image",
    flags="attachment",
    expires_at=int(time.time() + 3600)
)
print("URL:", url_att)
try:
    req = urllib.request.Request(url_att)
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print(e.read().decode('utf-8', errors='ignore'))

