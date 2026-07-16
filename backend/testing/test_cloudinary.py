import asyncio
import cloudinary
import cloudinary.uploader
import cloudinary.utils
from app.core import config

cloudinary.config(
    cloud_name=config.CLOUDINARY_CLOUD_NAME,
    api_key=config.CLOUDINARY_API_KEY,
    api_secret=config.CLOUDINARY_API_SECRET,
    secure=True
)

async def test():
    # 1. Create a dummy PDF file
    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n264\n%%EOF\n"
    
    print("Uploading PDF...")
    result = cloudinary.uploader.upload(
        pdf_content,
        folder="collisionguard/verification",
        public_id="test_pdf_123",
        overwrite=True,
        resource_type="auto",
        type="private"
    )
    print("Upload result:")
    print("public_id:", result.get("public_id"))
    print("format:", result.get("format"))
    print("resource_type:", result.get("resource_type"))

    # 2. Generate signed URL with .pdf extension
    import time
    url, _ = cloudinary.utils.cloudinary_url(
        f"{result['public_id']}.{result['format']}",
        sign_url=True,
        type="private",
        resource_type="image",
        expires_at=int(time.time() + 3600)
    )
    print("Signed URL:", url)

    # 3. Fetch the URL and see the response
    import urllib.request
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            print("Status:", response.status)
            print("Content-Type:", response.headers.get('Content-Type'))
            print("Body length:", len(response.read()))
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.reason)
        print(e.read().decode('utf-8', errors='ignore'))

asyncio.run(test())
