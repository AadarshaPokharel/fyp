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

def test_fetch(public_id, format=None, full_public_id=None):
    if full_public_id:
        url, _ = cloudinary.utils.cloudinary_url(
            full_public_id,
            sign_url=True,
            type="private",
            resource_type="image",
            expires_at=int(time.time() + 3600)
        )
    else:
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            format=format,
            sign_url=True,
            type="private",
            resource_type="image",
            expires_at=int(time.time() + 3600)
        )
    print("Trying URL:", url)
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status, "Content-Type:", response.headers.get('Content-Type'))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.reason)

print("Test 1: Passing full public_id with extension")
test_fetch(None, full_public_id="collisionguard/verification/test_pdf_123.pdf")

print("\nTest 2: Passing base public_id and format")
test_fetch("collisionguard/verification/test_pdf_123", format="pdf")

