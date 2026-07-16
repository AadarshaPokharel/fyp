import asyncio
from app.services.storage_service import storage_service
import cloudinary.uploader
import cloudinary.utils
import urllib.request
import time

async def test():
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n264\n%%EOF\n"
    
    # 1. Upload as RAW
    result = cloudinary.uploader.upload(
        pdf_content,
        folder="collisionguard/verification",
        public_id="test_pdf_raw.pdf", # Must include extension for raw
        overwrite=True,
        resource_type="raw",
        type="private"
    )
    print("Uploaded as raw:", result.get("public_id"))
    
    # 2. Generate signed URL for RAW
    url, _ = cloudinary.utils.cloudinary_url(
        result["public_id"],
        sign_url=True,
        type="private",
        resource_type="raw",
        expires_at=int(time.time() + 3600)
    )
    print("Signed URL:", url)
    
    # 3. Fetch
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
            print("Content-Type:", response.headers.get("Content-Type"))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code)
        print(e.read().decode("utf-8", errors="ignore"))

asyncio.run(test())
